import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  NOTIFICATION_PRIORITIES,
  normalizeNotificationActionUrl,
  type NotificationPriority,
} from '@/lib/notifications';

export { NOTIFICATION_PRIORITIES };

interface NotificationInput {
  agency_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  priority?: NotificationPriority;
  action_url?: string | null;
  dedup_key: string;
  metadata?: Record<string, unknown>;
}

export async function persistNotifications(
  serviceAdmin: SupabaseClient,
  inputs: NotificationInput[],
): Promise<number> {
  if (!inputs.length) return 0;
  const deduplicated = [...new Map(inputs.map((input) => [input.dedup_key, input])).values()];
  const rows = deduplicated.map((input) => ({
    ...input,
    type: input.type.trim().slice(0, 80),
    title: input.title.trim().slice(0, 200),
    message: input.message.trim().slice(0, 2000),
    entity_type: input.entity_type?.trim().slice(0, 80) || null,
    entity_id: input.entity_id?.trim().slice(0, 200) || null,
    priority: input.priority || 'normal',
    action_url: normalizeNotificationActionUrl(input.action_url),
    dedup_key: input.dedup_key.trim().slice(0, 300),
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }));
  const { error } = await serviceAdmin.from('notifications').upsert(rows, {
    onConflict: 'agency_id,user_id,dedup_key', ignoreDuplicates: false,
  });
  if (error) throw new Error(error.message);
  return rows.length;
}

/**
 * Creates reminders whose condition becomes true only as time passes. Event
 * notifications (new lead, match, portal error, transaction) are created by DB
 * triggers, so refreshing the inbox does not duplicate them.
 */
export async function syncTimeBasedNotifications(
  db: SupabaseClient,
  serviceAdmin: SupabaseClient,
  agencyId: string,
  userId: string,
): Promise<{ created_or_refreshed: number; warnings: string[] }> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const warnings: string[] = [];

  const results = await Promise.allSettled([
    db.from('leads').select('id,contact_name,received_at').eq('agency_id', agencyId).is('deleted_at', null)
      .or(`agent_id.eq.${userId},assigned_to.eq.${userId}`)
      .eq('status', 'new').gte('received_at', monthAgo).lt('received_at', dayAgo)
      .order('received_at', { ascending: false }).limit(50),
    db.from('tasks').select('id,title,due_at').eq('agency_id', agencyId).neq('status', 'done')
      .eq('assigned_to', userId)
      .lt('due_at', now.toISOString()).order('due_at', { ascending: false }).limit(50),
    db.from('calendar_events').select('id,title,start_at').eq('agency_id', agencyId).is('deleted_at', null)
      .eq('agent_id', userId)
      .eq('type', 'vizionare').in('status', ['programata', 'confirmata'])
      .gte('start_at', now.toISOString()).lte('start_at', in48Hours).order('start_at').limit(50),
    db.from('property_documents').select('id,file_name,property_id,expires_at,properties!inner(agent_id)').eq('agency_id', agencyId)
      .eq('properties.agent_id', userId)
      .not('expires_at', 'is', null).lte('expires_at', now.toISOString())
      .order('expires_at', { ascending: false }).limit(50),
  ]);

  const rows = <T>(index: number, label: string): T[] => {
    const result = results[index];
    if (result.status === 'rejected') { warnings.push(`${label}: ${String(result.reason)}`); return []; }
    if (result.value.error) { warnings.push(`${label}: ${result.value.error.message}`); return []; }
    return (result.value.data || []) as T[];
  };

  const leads = rows<{ id: string; contact_name?: string; received_at: string }>(0, 'leaduri');
  const tasks = rows<{ id: string; title: string; due_at: string }>(1, 'taskuri');
  const viewings = rows<{ id: string; title: string; start_at: string }>(2, 'vizionări');
  const documents = rows<{ id: string; file_name: string; property_id: string; expires_at: string }>(3, 'documente');
  const notifications: NotificationInput[] = [
    ...leads.map((lead) => ({
      agency_id: agencyId, user_id: userId, type: 'lead_uncontacted', title: 'Lead necontactat',
      message: `${lead.contact_name || 'Clientul'} nu a fost contactat în 24 de ore.`, entity_type: 'lead',
      entity_id: lead.id, priority: 'urgent' as const, action_url: `/clients/${lead.id}`,
      dedup_key: `lead_uncontacted:${lead.id}`,
    })),
    ...tasks.map((task) => ({
      agency_id: agencyId, user_id: userId, type: 'task_overdue', title: 'Task expirat', message: task.title,
      entity_type: 'task', entity_id: task.id, priority: 'high' as const, action_url: '/tasks',
      dedup_key: `task_overdue:${task.id}`,
    })),
    ...viewings.map((viewing) => ({
      agency_id: agencyId, user_id: userId, type: 'viewing_reminder', title: 'Vizionare programată',
      message: viewing.title || 'Ai o vizionare în următoarele 48 de ore.', entity_type: 'viewing',
      entity_id: viewing.id, priority: 'high' as const, action_url: '/viewings',
      dedup_key: `viewing_reminder:${viewing.id}`,
    })),
    ...documents.map((document) => ({
      agency_id: agencyId, user_id: userId, type: 'document_expired', title: 'Document expirat',
      message: `Documentul ${document.file_name} a expirat.`, entity_type: 'property_document',
      entity_id: document.id, priority: 'high' as const, action_url: `/properties/${document.property_id}`,
      dedup_key: `document_expired:${document.id}`,
    })),
  ];

  try {
    return { created_or_refreshed: await persistNotifications(serviceAdmin, notifications), warnings };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return { created_or_refreshed: 0, warnings };
  }
}
