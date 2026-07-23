export const dynamic = 'force-dynamic';

import { PROSPECT_STATUSES, prospectMatchKey } from '@/lib/prospects/normalize';
import { contextCanManageAll, contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';

const PAGE_SIZE_MAX = 50;
const MANUAL_STATUSES = new Set(['contacted', 'interested', 'rejected', 'imported_to_portfolio']);
const SELECT_FIELDS = [
  'id','source','external_id','url','canonical_url','title','price','currency','category','transaction',
  'county','city','zone','phone','seller_name','posted_at','status','assigned_to','notes','first_seen_at',
  'last_seen_at','last_checked_at','sync_error','processed_at','duplicate_group_key','duplicate_confidence',
  'duplicate_reasons','agency_suspected','agency_confidence','agency_reasons','missing_count',
].join(',');

function integerParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function numberParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const params = new URL(request.url).searchParams;
    const page = integerParam(params.get('page'), 1, 1, 100_000);
    const pageSize = integerParam(params.get('page_size'), 25, 1, PAGE_SIZE_MAX);
    const from = (page - 1) * pageSize;

    const { data: healthRows, error: healthError } = await admin
      .from('prospect_source_health')
      .select('source,label,active,terms_url,compliance_status,compliance_note,last_run_at,last_success_at,last_error_at,last_error,last_duration_ms,last_processed_count,success_count,error_count,consecutive_failures,last_run_complete')
      .eq('agency_id', agencyId)
      .order('label');
    if (healthError) {
      if (/relation|does not exist/i.test(healthError.message)) {
        return Response.json({ prospects: [], needsMigration: true, pagination: { page, page_size: pageSize, total: 0, pages: 0 } });
      }
      return Response.json({ error: healthError.message }, { status: 500 });
    }

    const sources = (healthRows ?? []).map((row) => ({
      ...row,
      success_rate: Number(row.success_count) + Number(row.error_count) > 0
        ? Math.round((Number(row.success_count) / (Number(row.success_count) + Number(row.error_count))) * 100)
        : null,
    }));
    const activeSources = new Set(sources.filter((source) => source.active).map((source) => source.source));
    const requestedSource = prospectMatchKey(params.get('source')).replace(/ /g, '_');
    if (requestedSource && !activeSources.has(requestedSource)) {
      return Response.json({ error: 'Sursa selectată este inactivă sau inexistentă.' }, { status: 400 });
    }

    let query = admin.from('prospects').select(SELECT_FIELDS, { count: 'exact' })
      .eq('agency_id', agencyId).is('deleted_at', null);

    const status = params.get('status');
    if (status === 'actionable') query = query.in('status', ['new', 'active']);
    else if (status) {
      if (!(PROSPECT_STATUSES as readonly string[]).includes(status)) {
        return Response.json({ error: 'Status invalid.' }, { status: 400 });
      }
      query = query.eq('status', status);
    }
    if (requestedSource) query = query.eq('source_normalized', requestedSource);
    const category = prospectMatchKey(params.get('category')).replace(/ /g, '_');
    if (category) query = query.eq('category', category);
    const transaction = prospectMatchKey(params.get('transaction')).replace(/ /g, '_');
    if (transaction) query = query.eq('transaction', transaction);
    const city = prospectMatchKey(params.get('city'));
    if (city) query = query.eq('city_normalized', city);
    const county = prospectMatchKey(params.get('county'));
    if (county) query = query.eq('county_normalized', county);
    const search = prospectMatchKey(params.get('q')).slice(0, 100);
    if (search) query = query.ilike('search_text', `%${safeLike(search)}%`);
    const priceMin = numberParam(params.get('price_min'));
    const priceMax = numberParam(params.get('price_max'));
    if (priceMin !== null) query = query.gte('price_normalized', priceMin);
    if (priceMax !== null) query = query.lte('price_normalized', priceMax);
    if (params.get('duplicate') === '1') query = query.not('duplicate_group_key', 'is', null);
    if (params.get('agency_suspected') === '1') query = query.eq('agency_suspected', true);
    if (params.get('has_error') === '1') query = query.not('sync_error', 'is', null);

    const sort = params.get('sort') || 'last_seen_desc';
    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      last_seen_desc: { column: 'last_seen_at', ascending: false },
      first_seen_desc: { column: 'first_seen_at', ascending: false },
      price_asc: { column: 'price_normalized', ascending: true },
      price_desc: { column: 'price_normalized', ascending: false },
      last_checked_desc: { column: 'last_checked_at', ascending: false },
    };
    const selectedSort = sortMap[sort];
    if (!selectedSort) return Response.json({ error: 'Sortare invalidă.' }, { status: 400 });
    query = query.order(selectedSort.column, { ascending: selectedSort.ascending, nullsFirst: false })
      .order('id', { ascending: true }).range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const total = count ?? 0;
    return Response.json({
      prospects: data ?? [], sources,
      pagination: { page, page_size: pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'edit' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return Response.json({ error: 'ID lipsă.' }, { status: 400 });
    const { data: existing, error: existingError } = await admin.from('prospects')
      .select('id,assigned_to').eq('id', id).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
    if (!existing) return Response.json({ error: 'Anunțul nu există sau nu este accesibil.' }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!(PROSPECT_STATUSES as readonly string[]).includes(body.status)) {
        return Response.json({ error: 'Status invalid.' }, { status: 400 });
      }
      patch.status = body.status;
      if (MANUAL_STATUSES.has(body.status)) patch.processed_at = new Date().toISOString();
    }
    if (body.notes !== undefined) patch.notes = String(body.notes ?? '').trim().slice(0, 4000) || null;
    if (body.assigned_to !== undefined) {
      const requestedAssignee = body.assigned_to || null;
      const canAssign = contextHasPermission(auth.context, 'prospects', 'assign')
        || contextCanManageAll(auth.context, 'prospects');
      if (!canAssign && requestedAssignee !== user.id) {
        return Response.json({ error: 'Nu poți atribui anunțul altui agent.' }, { status: 403 });
      }
      if (requestedAssignee) {
        const { data: agent } = await admin.from('profiles').select('user_id')
          .eq('user_id', requestedAssignee).eq('agency_id', agencyId).eq('status', 'active').maybeSingle();
        if (!agent) return Response.json({ error: 'Agent invalid pentru această agenție.' }, { status: 400 });
      }
      patch.assigned_to = requestedAssignee;
    } else if (!existing.assigned_to && !contextCanManageAll(auth.context, 'prospects')) {
      patch.assigned_to = user.id;
    }
    if (!Object.keys(patch).length) return Response.json({ error: 'Nimic de actualizat.' }, { status: 400 });

    const { data, error } = await admin.from('prospects').update(patch)
      .eq('id', id).eq('agency_id', agencyId).is('deleted_at', null)
      .select('id,status,notes,assigned_to,processed_at').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ prospect: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'delete' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă.' }, { status: 400 });
    const { data, error } = await admin.from('prospects')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id).eq('agency_id', agencyId).is('deleted_at', null).select('id').maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Anunțul nu există sau nu este accesibil.' }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}
