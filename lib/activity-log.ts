import { createClient } from '@supabase/supabase-js';

// Server-only helper. Writes to the `activity_logs` table. Never throws —
// logging must never break the request it is attached to.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface LogEntry {
  agency_id: string;
  entity_type: string;            // 'property' | 'lead' | 'task' | ...
  entity_id: string;
  user_id?: string | null;
  user_name?: string | null;
  action: string;                 // 'create' | 'update' | 'status' | 'delete' | 'document'
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
}

/** Insert one or more activity-log rows. Swallows errors (best-effort logging). */
export async function logActivity(entry: LogEntry | LogEntry[]): Promise<void> {
  const rows = Array.isArray(entry) ? entry : [entry];
  if (rows.length === 0) return;
  try {
    await admin.from('activity_logs').insert(
      rows.map(r => ({
        agency_id: r.agency_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        user_id: r.user_id ?? null,
        user_name: r.user_name ?? null,
        action: r.action,
        field: r.field ?? null,
        old_value: r.old_value != null ? String(r.old_value) : null,
        new_value: r.new_value != null ? String(r.new_value) : null,
      }))
    );
  } catch (e) {
    console.error('[activity-log] insert failed:', e);
  }
}

export interface FieldChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

/**
 * Compare two flat objects for a labeled subset of keys and return the changes.
 * `labels` maps an object key → the human label stored in the log.
 */
export function diffFields(
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown> | null | undefined,
  labels: Record<string, string>
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const o = oldObj?.[key];
    const n = newObj?.[key];
    const os = o == null || o === '' ? null : String(o);
    const ns = n == null || n === '' ? null : String(n);
    if (os !== ns) changes.push({ field: label, old_value: os, new_value: ns });
  }
  return changes;
}

/** Best-effort lookup of a user's display name for log attribution. */
export async function getUserName(userId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .single();
    return data?.full_name ?? null;
  } catch {
    return null;
  }
}
