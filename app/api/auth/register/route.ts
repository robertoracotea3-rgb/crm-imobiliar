export const dynamic = 'force-dynamic';

import { createHash, timingSafeEqual } from 'node:crypto';

import {
  checkRateLimit,
  recordRateLimitResult,
  requestIpHash,
} from '@/lib/server/account-security';
import { getAdminClient } from '@/lib/server/api-auth';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';

// Fail closed: registration is disabled unless REGISTRATION_ACCESS_CODE is set
// in the environment. No hardcoded fallback (avoids a universally-known code).
const ACCESS_CODE = process.env.REGISTRATION_ACCESS_CODE?.toUpperCase() || '';

// Username: only letters, numbers, dots, underscores (3-30 chars)
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;

function safeAccessCodeMatch(received: unknown): boolean {
  if (typeof received !== 'string' || !ACCESS_CODE) return false;
  const expected = createHash('sha256').update(ACCESS_CODE).digest();
  const actual = createHash('sha256').update(received.trim().toUpperCase()).digest();
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    if ((origin && origin !== new URL(request.url).origin)
      || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
      return Response.json({ error: 'Cerere invalidă.' }, { status: 403 });
    }
    if (!ACCESS_CODE) {
      return Response.json(
        { error: 'Înregistrarea este dezactivată (lipsește REGISTRATION_ACCESS_CODE).' },
        { status: 503 }
      );
    }

    const supabaseAdmin = getAdminClient();
    let registrationRateEntry: { scope: 'registration_ip'; keyHash: string } | null = null;
    try {
      const ipHash = requestIpHash(request);
      if (ipHash) registrationRateEntry = { scope: 'registration_ip', keyHash: ipHash };
    } catch {
      return Response.json({ error: 'Protecția înregistrării nu este configurată.' }, { status: 503 });
    }
    if (registrationRateEntry) {
      const decision = await checkRateLimit(supabaseAdmin, [registrationRateEntry]);
      if (!decision.allowed) {
        return Response.json(
          { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
          { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
        );
      }
      try {
        // Registration uses a fixed-window quota. Successful account creation
        // must not reset the IP counter and bypass that quota.
        await recordRateLimitResult(supabaseAdmin, [registrationRateEntry], false);
      } catch {
        return Response.json({ error: 'Protecția înregistrării nu este disponibilă.' }, { status: 503 });
      }
    }

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: 'Date invalide' }, { status: 400 });

    const { username, password, agencyName, accessCode } = body;

    if (!safeAccessCodeMatch(accessCode)) {
      return Response.json({ error: 'Cod de acces incorect' }, { status: 403 });
    }

    if (!username || !password || !agencyName) {
      return Response.json({ error: 'Toate campurile sunt obligatorii' }, { status: 400 });
    }

    if (!USERNAME_RE.test(username)) {
      return Response.json({ error: 'Numele de utilizator poate conține doar litere, cifre, punct și underscore (3-30 caractere)' }, { status: 400 });
    }

    if (!isStrongPassword(password)) {
      return Response.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    if (typeof agencyName !== 'string' || agencyName.trim().length < 2) {
      return Response.json({ error: 'Numele agenției este prea scurt' }, { status: 400 });
    }

    const email = `${username.trim().toLowerCase().replace(/\s+/g, '.')}@fortis.crm`;

    // Creeaza user fara confirmare email
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: username.trim().toLowerCase() },
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return Response.json({ error: 'Numele de utilizator este deja folosit' }, { status: 400 });
      }
      return Response.json({ error: 'Contul nu a putut fi creat.' }, { status: 400 });
    }

    if (!authData.user) {
      return Response.json({ error: 'Eroare la creare cont' }, { status: 500 });
    }

    // Creeaza agentia
    const slug = agencyName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();

    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .insert([{ name: agencyName, slug }])
      .select()
      .single();

    if (agencyError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('Agency creation error:', agencyError);
      return Response.json({ error: 'Eroare la crearea agenției' }, { status: 500 });
    }

    // Creeaza profilul
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([{
        user_id: authData.user.id,
        agency_id: agencyData.id,
        role: 'owner',
        status: 'active',
        force_password_change: false,
      }]);

    if (profileError) {
      await supabaseAdmin.from('agencies').delete().eq('id', agencyData.id);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('Profile creation error:', profileError);
      return Response.json({ error: 'Eroare la crearea profilului' }, { status: 500 });
    }

    // Template-uri default
    await supabaseAdmin.from('message_templates').insert([
      {
        agency_id: agencyData.id,
        name: 'Prezentare proprietate',
        subject: 'Proprietatea {titlu_proprietate}',
        body: 'Bună {nume_client},\n\nVă prezint proprietatea {titlu_proprietate} cu prețul de {pret} RON.\n\nDoriți să vizitați?\n\nAșteptăm răspunsul dvs.',
      },
      {
        agency_id: agencyData.id,
        name: 'Follow-up lead',
        subject: 'Urmărire - {titlu_proprietate}',
        body: 'Bună {nume_client},\n\nNu ați răspuns încă la oferta pentru {titlu_proprietate}. Sunt disponibil pentru orice întrebări!\n\n{nume_agent}',
      },
    ]);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error && error.message.includes('anti-abuz')
        ? 'Protecția înregistrării nu este disponibilă.'
        : 'Eroare server' },
      { status: 500 }
    );
  }
}
