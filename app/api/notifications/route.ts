export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'notifications', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const now = new Date();
    const notifications: Array<{
      id: string;
      type: string;
      severity: string;
      message: string;
      link?: string;
      created_at: string;
    }> = [];

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
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('status', 'activa')
        .filter('attributes->photos', 'is', 'null')
        .limit(10),
      admin.from('properties')
        .select('id, title, internal_code')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('status', 'activa')
        .or('description.is.null,description.eq.')
        .limit(10),
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('status', 'new')
        .lt('received_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .limit(5),
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('status', 'new')
        .gte('received_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
        .limit(5),
      admin.from('leads')
        .select('id, contact_name, received_at')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('status', 'new')
        .lt('received_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(5),
      admin.from('properties')
        .select('id, title, created_at')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3),
      admin.from('leads')
        .select('id, contact_name, received_at, agent_id')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .eq('agent_id', user.id)
        .gte('received_at', new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())
        .order('received_at', { ascending: false })
        .limit(10),
    ]);

    (newClientsForAgent || []).forEach((l) => {
      const hoursAgo = Math.floor((now.getTime() - new Date(l.received_at).getTime()) / (1000 * 60 * 60));
      const when = hoursAgo < 1 ? 'acum' : hoursAgo === 1 ? 'acum 1 ora' : `acum ${hoursAgo}h`;
      notifications.push({
        id: `new_client_agent_${l.id}`,
        type: 'client',
        severity: 'alert',
        message: `Clientul ${l.contact_name || ''} ti-a fost alocat (${when}) - verifica si contacteaza`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    (newClients || []).forEach((l) => {
      notifications.push({
        id: `new_client_${l.id}`,
        type: 'client',
        severity: 'alert',
        message: `Client nou: ${l.contact_name} - necesita raspuns urgent`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    (oldUnansweredClients || []).forEach((l) => {
      const hours = Math.floor((now.getTime() - new Date(l.received_at).getTime()) / (1000 * 60 * 60));
      notifications.push({
        id: `old_client_${l.id}`,
        type: 'client',
        severity: 'warning',
        message: `Clientul ${l.contact_name} fara raspuns de ${hours}h`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    if ((propsNoPhoto || []).length > 0) {
      notifications.push({
        id: 'no_photos_batch',
        type: 'property',
        severity: 'warning',
        message: `${propsNoPhoto!.length} proprietati active fara fotografii - adauga poze pentru mai multa vizibilitate`,
        link: '/properties',
        created_at: now.toISOString(),
      });
    }

    if ((propsNoDesc || []).length > 0) {
      notifications.push({
        id: 'no_desc_batch',
        type: 'property',
        severity: 'info',
        message: `${propsNoDesc!.length} proprietati fara descriere - completeaza pentru SEO mai bun`,
        link: '/properties',
        created_at: now.toISOString(),
      });
    }

    (oldUncontactedClients || []).forEach((l) => {
      notifications.push({
        id: `old_uncontacted_${l.id}`,
        type: 'client',
        severity: 'info',
        message: `Clientul ${l.contact_name || ''} e in asteptare de peste 14 zile - verifica daca mai este actual`,
        link: '/clients',
        created_at: l.received_at,
      });
    });

    (recentProps || []).forEach((p) => {
      notifications.push({
        id: `new_prop_${p.id}`,
        type: 'success',
        severity: 'success',
        message: `Proprietate noua adaugata: ${p.title}`,
        link: `/properties/${p.id}`,
        created_at: p.created_at,
      });
    });

    notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({ notifications: notifications.slice(0, 50), total: notifications.length });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
