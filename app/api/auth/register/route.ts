export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fail closed: registration is disabled unless REGISTRATION_ACCESS_CODE is set
// in the environment. No hardcoded fallback (avoids a universally-known code).
const ACCESS_CODE = process.env.REGISTRATION_ACCESS_CODE?.toUpperCase() || '';

// Username: only letters, numbers, dots, underscores (3-30 chars)
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;

export async function POST(request: Request) {
  try {
    if (!ACCESS_CODE) {
      return Response.json(
        { error: 'Înregistrarea este dezactivată (lipsește REGISTRATION_ACCESS_CODE).' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: 'Date invalide' }, { status: 400 });

    const { username, password, agencyName, accessCode } = body;

    if (!accessCode || (accessCode as string).toUpperCase() !== ACCESS_CODE) {
      return Response.json({ error: 'Cod de acces incorect' }, { status: 403 });
    }

    if (!username || !password || !agencyName) {
      return Response.json({ error: 'Toate campurile sunt obligatorii' }, { status: 400 });
    }

    if (!USERNAME_RE.test(username)) {
      return Response.json({ error: 'Numele de utilizator poate conține doar litere, cifre, punct și underscore (3-30 caractere)' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return Response.json({ error: 'Parola trebuie să aibă cel puțin 8 caractere' }, { status: 400 });
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
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return Response.json({ error: 'Numele de utilizator este deja folosit' }, { status: 400 });
      }
      return Response.json({ error: authError.message }, { status: 400 });
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
      }]);

    if (profileError) {
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
      { error: error instanceof Error ? error.message : 'Eroare server' },
      { status: 500 }
    );
  }
}
