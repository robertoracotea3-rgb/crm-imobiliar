export const dynamic = 'force-dynamic';

import { requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';
import { processPortalRemovalJobs } from '@/lib/server/portal-removals';
import {
  TRANSACTION_STATUS_TRANSITIONS,
  canTransition,
  isTransactionStatus,
} from '@/lib/crm-catalogs';
import {
  TRANSACTION_CURRENCIES,
  TRANSACTION_TYPES,
  nonNegativeMoney,
} from '@/lib/transactions';

const PAGE_SIZE_MAX = 50;
const migrationError = (message: string) => /relation|does not exist|schema cache/i.test(message);
const positiveInt = (value: string | null, fallback: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};
const allowed = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Eroare necunoscută');
}

async function validateRefs(
  context: AuthenticatedContext,
  refs: { property_id?: string | null; contact_id?: string | null; agent_id?: string | null; lead_id?: string | null },
): Promise<Response | null> {
  const { admin, agencyId } = context;
  const checks = await Promise.all([
    refs.property_id
      ? admin.from('properties').select('id').eq('id', refs.property_id).eq('agency_id', agencyId)
        .is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
    refs.contact_id
      ? admin.from('contacts').select('id').eq('id', refs.contact_id).eq('agency_id', agencyId)
        .is('deleted_at', null).eq('merge_status', 'active').maybeSingle()
      : Promise.resolve({ data: null }),
    refs.agent_id
      ? admin.from('profiles').select('user_id').eq('user_id', refs.agent_id).eq('agency_id', agencyId)
        .eq('status', 'active').maybeSingle()
      : Promise.resolve({ data: null }),
    refs.lead_id
      ? admin.from('leads').select('id').eq('id', refs.lead_id).eq('agency_id', agencyId)
        .is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (refs.property_id && !checks[0].data) return Response.json({ error: 'Proprietatea nu este accesibilă.' }, { status: 400 });
  if (refs.contact_id && !checks[1].data) return Response.json({ error: 'Clientul nu este accesibil.' }, { status: 400 });
  if (refs.agent_id && !checks[2].data) return Response.json({ error: 'Agentul nu este activ în agenție.' }, { status: 400 });
  if (refs.lead_id && !checks[3].data) return Response.json({ error: 'Leadul nu este accesibil.' }, { status: 400 });
  return null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, serviceAdmin, agencyId } = auth.context;
    const params = new URL(request.url).searchParams;
    const page = positiveInt(params.get('page'), 1, 100_000);
    const pageSize = positiveInt(params.get('page_size'), 25, PAGE_SIZE_MAX);
    const from = (page - 1) * pageSize;
    let query = admin.from('transactions').select(
      'id,property_id,agent_id,contact_id,lead_id,type,status,status_reason,sale_price,currency,agency_commission,agent_commission,reservation_at,reservation_amount,closed_at,completed_at,notes,legacy_import,legacy_import_reason,property_code_snapshot,property_title_snapshot,contact_name_snapshot,created_at,updated_at',
      { count: 'exact' },
    ).eq('agency_id', agencyId).is('deleted_at', null);
    const status = params.get('status');
    if (status) {
      if (!isTransactionStatus(status)) return Response.json({ error: 'Status invalid.' }, { status: 400 });
      query = query.eq('status', status);
    }
    const search = params.get('search')?.trim().slice(0, 100);
    if (search) query = query.ilike('search_text', `%${search.replace(/[%_]/g, '')}%`);
    const { data, error, count } = await query.order('updated_at', { ascending: false })
      .order('id', { ascending: true }).range(from, from + pageSize - 1);
    if (error) {
      if (migrationError(error.message)) {
        return Response.json({ transactions: [], needsMigration: true,
          pagination: { page: 1, page_size: pageSize, total: 0, pages: 0 } });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    const ids = (data || []).map((item) => item.id);
    const { data: jobs } = ids.length
      ? await serviceAdmin.from('portal_removal_jobs')
        .select('id,transaction_id,portal,status,attempts,max_attempts,next_attempt_at,last_error,confirmed_at')
        .eq('agency_id', agencyId).in('transaction_id', ids).order('requested_at', { ascending: false })
      : { data: [] };
    const jobsByTransaction = new Map<string, unknown[]>();
    for (const job of jobs || []) {
      const current = jobsByTransaction.get(job.transaction_id) || [];
      current.push(job); jobsByTransaction.set(job.transaction_id, current);
    }
    const total = count || 0;
    return Response.json({
      transactions: (data || []).map((item) => ({
        ...item, removal_jobs: jobsByTransaction.get(item.id) || [],
      })),
      pagination: { page, page_size: pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'create' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const refs = {
      property_id: typeof body.property_id === 'string' ? body.property_id : null,
      contact_id: typeof body.contact_id === 'string' ? body.contact_id : null,
      agent_id: typeof body.agent_id === 'string' && body.agent_id ? body.agent_id : user.id,
      lead_id: typeof body.lead_id === 'string' && body.lead_id ? body.lead_id : null,
    };
    if (!refs.property_id || !refs.contact_id) {
      return Response.json({ error: 'Proprietatea și clientul sunt obligatorii.' }, { status: 400 });
    }
    const refsError = await validateRefs(auth.context, refs);
    if (refsError) return refsError;
    const salePrice = nonNegativeMoney(body.sale_price);
    const agencyCommission = body.agency_commission === '' || body.agency_commission == null
      ? 0 : nonNegativeMoney(body.agency_commission);
    const agentCommission = body.agent_commission === '' || body.agent_commission == null
      ? 0 : nonNegativeMoney(body.agent_commission);
    if (!salePrice) return Response.json({ error: 'Prețul tranzacției trebuie să fie mai mare decât zero.' }, { status: 400 });
    if (agencyCommission === null || agentCommission === null) {
      return Response.json({ error: 'Comisioanele nu pot fi negative.' }, { status: 400 });
    }
    if (!allowed(TRANSACTION_TYPES, body.type) || !allowed(TRANSACTION_CURRENCIES, body.currency)) {
      return Response.json({ error: 'Tipul sau moneda tranzacției este invalidă.' }, { status: 400 });
    }
    const { data, error } = await admin.from('transactions').insert({
      agency_id: agencyId, created_by: user.id, ...refs,
      type: body.type, status: 'draft', sale_price: salePrice, currency: body.currency,
      agency_commission: agencyCommission, agent_commission: agentCommission,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 3000) || null : null,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ transaction: data }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'edit' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;
    const body = await request.json();
    if (typeof body.id !== 'string') return Response.json({ error: 'ID lipsă.' }, { status: 400 });
    const { data: existing } = await admin.from('transactions')
      .select('id,status,property_id,contact_id,agent_id,lead_id,legacy_import,sale_price,reservation_at,reservation_amount')
      .eq('id', body.id).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (!existing) return Response.json({ error: 'Tranzacția nu există.' }, { status: 404 });

    if (body.status === 'finalizata') {
      const extraFields = Object.keys(body).filter((key) => !['id', 'status'].includes(key));
      if (extraFields.length) {
        return Response.json({ error: 'Salvează modificările înainte de finalizarea atomică.' }, { status: 400 });
      }
      const { data, error } = await serviceAdmin.rpc('crm_finalize_transaction', {
        p_agency_id: agencyId, p_transaction_id: existing.id, p_actor_id: user.id,
      });
      if (error) return Response.json({ error: error.message }, { status: 409 });
      const removalDeliveries = await processPortalRemovalJobs(serviceAdmin, agencyId, {
        transactionId: existing.id, limit: 20,
      }).catch((caught) => [{ status: 'retry', error: message(caught) }]);
      const { data: transaction } = await admin.from('transactions').select('*').eq('id', existing.id).single();
      return Response.json({ transaction, finalization: data, removal_deliveries: removalDeliveries });
    }
    if (existing.status === 'finalizata') {
      return Response.json({ error: 'O tranzacție finalizată nu poate fi modificată direct.' }, { status: 409 });
    }

    const nextStatus = body.status === undefined ? existing.status : body.status;
    if (!isTransactionStatus(nextStatus)) return Response.json({ error: 'Status invalid.' }, { status: 400 });
    if (body.status !== undefined
      && (!isTransactionStatus(existing.status)
        || !canTransition(TRANSACTION_STATUS_TRANSITIONS, existing.status, nextStatus))) {
      return Response.json({ error: `Tranziția ${existing.status} → ${nextStatus} nu este permisă.` }, { status: 409 });
    }
    const refs = {
      property_id: body.property_id === undefined ? existing.property_id : body.property_id || null,
      contact_id: body.contact_id === undefined ? existing.contact_id : body.contact_id || null,
      agent_id: body.agent_id === undefined ? existing.agent_id : body.agent_id || null,
      lead_id: body.lead_id === undefined ? existing.lead_id : body.lead_id || null,
    };
    if (!existing.legacy_import && (!refs.property_id || !refs.contact_id || !refs.agent_id)) {
      return Response.json({ error: 'Proprietatea, clientul și agentul sunt obligatorii.' }, { status: 400 });
    }
    const refsError = await validateRefs(auth.context, refs);
    if (refsError) return refsError;
    const safe: Record<string, unknown> = { ...refs, status: nextStatus };
    if (body.type !== undefined) {
      if (!allowed(TRANSACTION_TYPES, body.type)) return Response.json({ error: 'Tip invalid.' }, { status: 400 });
      safe.type = body.type;
    }
    if (body.currency !== undefined) {
      if (!allowed(TRANSACTION_CURRENCIES, body.currency)) return Response.json({ error: 'Monedă invalidă.' }, { status: 400 });
      safe.currency = body.currency;
    }
    for (const field of ['sale_price', 'agency_commission', 'agent_commission'] as const) {
      if (body[field] === undefined) continue;
      const value = field !== 'sale_price' && (body[field] === '' || body[field] === null)
        ? 0 : nonNegativeMoney(body[field]);
      if (value === null || (field === 'sale_price' && value <= 0)) {
        return Response.json({ error: 'Valorile financiare sunt invalide.' }, { status: 400 });
      }
      safe[field] = value;
    }
    if (body.reservation_amount !== undefined) {
      const value = body.reservation_amount === '' || body.reservation_amount === null
        ? null
        : nonNegativeMoney(body.reservation_amount);
      if (body.reservation_amount !== '' && body.reservation_amount !== null && value === null) {
        return Response.json({ error: 'Suma rezervării nu poate fi negativă.' }, { status: 400 });
      }
      safe.reservation_amount = value;
    }
    if (body.reservation_at !== undefined) {
      const reservationAt = body.reservation_at ? new Date(body.reservation_at) : null;
      if (body.reservation_at && (!reservationAt || Number.isNaN(reservationAt.getTime()))) {
        return Response.json({ error: 'Data rezervării este invalidă.' }, { status: 400 });
      }
      safe.reservation_at = reservationAt?.toISOString() || null;
    }
    if (nextStatus === 'rezervata') {
      const effectiveSalePrice = Number(safe.sale_price ?? existing.sale_price);
      const effectiveReservationAt = safe.reservation_at ?? existing.reservation_at;
      if (!refs.property_id || !refs.contact_id || effectiveSalePrice <= 0 || !effectiveReservationAt) {
        return Response.json({
          error: 'Rezervarea cere proprietate, client, sumă și data rezervării.',
        }, { status: 400 });
      }
    }
    if (body.notes !== undefined) safe.notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 3000) || null : null;
    if (nextStatus === 'anulata') {
      const reason = typeof body.status_reason === 'string' ? body.status_reason.trim() : '';
      if (!reason) return Response.json({ error: 'Motivul anulării este obligatoriu.' }, { status: 400 });
      safe.status_reason = reason.slice(0, 500); safe.cancelled_at = new Date().toISOString();
    } else if (body.status !== undefined) safe.cancelled_at = null;
    const { data, error } = await admin.from('transactions').update(safe)
      .eq('id', existing.id).eq('agency_id', agencyId).is('deleted_at', null).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ transaction: data });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'delete' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId, user } = auth.context;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'ID lipsă.' }, { status: 400 });
  const { data: existing } = await admin.from('transactions').select('id,status').eq('id', id)
    .eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
  if (!existing) return Response.json({ error: 'Tranzacția nu există.' }, { status: 404 });
  if (existing.status === 'finalizata') {
    return Response.json({ error: 'Tranzacțiile finalizate se păstrează în istoricul financiar.' }, { status: 409 });
  }
  const { error } = await admin.from('transactions').update({
    deleted_at: new Date().toISOString(), deleted_by: user.id,
  }).eq('id', id).eq('agency_id', agencyId).is('deleted_at', null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
