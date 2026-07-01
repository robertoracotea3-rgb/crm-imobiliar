export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAgencyAndUser(token: string) {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalida');
  const { data: profile } = await admin.from('profiles').select('agency_id, role').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agentie negasita');
  return { user, agency_id: profile.agency_id, role: profile.role };
}

// GET — returns generated notifications from real DB data (no separate notifications table needed)
export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id } = await getAgencyAndUser(token);

    const now = new Date();
    const notifications: Array<{
      id: string; type: string; severity: string; message: string; link?: string; created_at: string;
    }> = [];

    // Parallel: properties without photos, without description, and clients (leads) needing attention
    const [
      { data: propsNoPhoto },
      { data: propsNoDesc },
      { data: oldUnansweredClients },
      { data: newClients },
      { data: oldUncontactedClients },
      { data: recentProps },
      { data: newClientsForAgent },
    ] = await Promise.all([
      admin.from('properties')
        .select('id, title, internal_code')
        .eq('agency_id', agency_id)
        .eq('status', 'activa')
        .filter('attributes->photos', 'is', 'null')
        .limit(10),
      admin.from('properties')
        .select('id, title, internal_code')
        .eq('agency_id', agency_id)
        .eq('status', 'activa')
        .or('description.is.null,description.eq.')
        .limit(10),
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agency_id)
        .eq('status', 'new')
        .lt('received_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .limit(5),
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agency_id)
        .eq('status', 'new')
        .gte('received_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
        .limit(5),
      // Clienți NOI (necontactați) mai vechi de 14 zile — merită verificați dacă mai sunt actuali
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agency_id)
        .eq('status', 'new')
        .lt('received_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(5),
      admin.from('properties')
        .select('id, title, created_at')
        .eq('agency_id', agency_id)
        .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3),
      // New clients allocated to current user in last 48h
      admin.from('leads')
        .select('id, contact_name, received_at, agent_id')
        .eq('agency_id', agency_id)
        .eq('agent_id', user.id)
        .gte('received_at', new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())
        .order('received_at', { ascending: false })
        .limit(10),
    ]);

    // New clients allocated to current user (last 48h) — high priority
    (newClientsForAgent || []).forEach(l => {
      const hoursAgo = Math.floor((now.getTime() - new Date(l.received_at).getTime()) / (1000 * 60 * 60));
      const when = hoursAgo < 1 ? 'acum' : hoursAgo === 1 ? 'acum 1 oră' : `acum ${hoursAgo}h`;
      notifications.push({
        id: `new_client_agent_${l.id}`,
        type: 'client',
        severity: 'alert',
        message: `Clientul ${l.contact_name || ''} ți-a fost alocat (${when}) — verifică și contactează`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    // New clients (last hour) — high priority
    (newClients || []).forEach(l => {
      notifications.push({
        id: `new_client_${l.id}`,
        type: 'client',
        severity: 'alert',
        message: `Client nou: ${l.contact_name} — necesită răspuns urgent`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    // Old unanswered clients (24h+)
    (oldUnansweredClients || []).forEach(l => {
      const hours = Math.floor((now.getTime() - new Date(l.received_at).getTime()) / (1000 * 60 * 60));
      notifications.push({
        id: `old_client_${l.id}`,
        type: 'client',
        severity: 'warning',
        message: `Clientul ${l.contact_name} fără răspuns de ${hours}h`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    // Properties without photos
    if ((propsNoPhoto || []).length > 0) {
      notifications.push({
        id: 'no_photos_batch',
        type: 'property',
        severity: 'warning',
        message: `${propsNoPhoto!.length} proprietăți active fără fotografii — adaugă poze pentru mai multă vizibilitate`,
        link: '/properties',
        created_at: now.toISOString(),
      });
    }

    // Properties without description
    if ((propsNoDesc || []).length > 0) {
      notifications.push({
        id: 'no_desc_batch',
        type: 'property',
        severity: 'info',
        message: `${propsNoDesc!.length} proprietăți fără descriere — completează pentru SEO mai bun`,
        link: '/properties',
        created_at: now.toISOString(),
      });
    }

    // Clienți NOI mai vechi de 14 zile — necontactați
    (oldUncontactedClients || []).forEach(l => {
      notifications.push({
        id: `old_uncontacted_${l.id}`,
        type: 'client',
        severity: 'info',
        message: `Clientul ${l.contact_name || ''} e în așteptare de peste 14 zile — verifică dacă mai este actual`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    // Recently added properties (success)
    (recentProps || []).forEach(p => {
      notifications.push({
        id: `new_prop_${p.id}`,
        type: 'success',
        severity: 'success',
        message: `Proprietate nouă adăugată: ${p.title}`,
        link: `/properties/${p.id}`,
        created_at: p.created_at,
      });
    });

    // Sort by created_at desc
    notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({ notifications: notifications.slice(0, 50), total: notifications.length });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
