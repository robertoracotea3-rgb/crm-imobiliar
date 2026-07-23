export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, agencyId, user, role } = auth.context;

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

    let previousAssignments: Array<{ id: string; agent_id: string | null }> = [];
    if (agent_id !== undefined) {
      const { data: currentRows, error: currentError } = await admin
        .from('properties')
        .select('id,agent_id')
        .in('id', ids)
        .eq('agency_id', agencyId)
        .is('deleted_at', null);
      if (currentError) return Response.json({ error: currentError.message }, { status: 500 });
      previousAssignments = currentRows || [];
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

    if (agent_id !== undefined) {
      await appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
        action: 'property.agent_reassigned', entityType: 'property_batch',
        before: { assignments: previousAssignments },
        after: { property_ids: ids, agent_id: agent_id || null },
        metadata: { affected_count: previousAssignments.length },
      });
    }
    if (publishSite || unpublishSite) {
      await appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
        action: 'property.publication_changed', entityType: 'property_batch',
        before: { property_ids: ids },
        after: { site_published: Boolean(publishSite) },
        metadata: { affected_count: ids.length },
      });
    }

    return Response.json({ success: true, count: ids.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Eroare internă' },
      { status: 500 },
    );
  }
}
