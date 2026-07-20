export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, agencyId } = auth.context;

    const { ids, agent_id, publishSite, unpublishSite } = await request.json() as {
      ids?: string[];
      agent_id?: string | null;
      publishSite?: boolean;
      unpublishSite?: boolean;
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'Nicio proprietate selectată' }, { status: 400 });
    }
    if (ids.length > 100 || ids.some(id => typeof id !== 'string' || !id)) {
      return Response.json({ error: 'Selecție invalidă sau prea mare' }, { status: 400 });
    }
    if (publishSite && unpublishSite) {
      return Response.json({ error: 'Acțiuni de publicare incompatibile' }, { status: 400 });
    }

    if (agent_id) {
      const { data: assignedAgent } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', agent_id)
        .eq('agency_id', agencyId)
        .maybeSingle();
      if (!assignedAgent) {
        return Response.json({ error: 'Agentul selectat nu aparține agenției' }, { status: 400 });
      }
    }

    if (agent_id !== undefined) {
      const { error } = await admin
        .from('properties')
        .update({ agent_id: agent_id || null, updated_at: new Date().toISOString() })
        .in('id', ids)
        .eq('agency_id', agencyId)
        .is('deleted_at', null);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    if (publishSite || unpublishSite) {
      const { data: rows, error: readError } = await admin
        .from('properties')
        .select('id, attributes')
        .in('id', ids)
        .eq('agency_id', agencyId)
        .is('deleted_at', null);
      if (readError) return Response.json({ error: readError.message }, { status: 500 });

      const results = await Promise.all((rows || []).map(row => {
        const attributes = (row.attributes as Record<string, unknown>) || {};
        const publication = (attributes.publicare as Record<string, unknown>) || {};
        return admin
          .from('properties')
          .update({
            attributes: {
              ...attributes,
              publicare: { ...publication, site: Boolean(publishSite) },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('agency_id', agencyId)
          .is('deleted_at', null);
      }));
      const failed = results.find(result => result.error);
      if (failed?.error) return Response.json({ error: failed.error.message }, { status: 500 });
    }

    return Response.json({ success: true, count: ids.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Eroare internă' },
      { status: 500 },
    );
  }
}
