export const dynamic = 'force-dynamic';

import { requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';
import {
  TRANSACTION_STATUS_TRANSITIONS,
  canTransition,
  isTransactionStatus,
} from '@/lib/crm-catalogs';

const VALID_TYPE = ['vanzare', 'inchiriere'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e ?? 'Eroare');
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const migrationError = (msg: string) => /relation|does not exist|schema cache/i.test(msg);

async function validateRefs(context: AuthenticatedContext, refs: { property_id?: string | null; contact_id?: string | null; agent_id?: string | null }) {
  const { admin, agencyId } = context;

  if (refs.property_id) {
    const { data } = await admin
      .from('properties')
      .select('id')
      .eq('id', refs.property_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Proprietate invalida pentru aceasta agentie' }, { status: 400 });
  }

  if (refs.contact_id) {
    const { data } = await admin
      .from('contacts')
      .select('id')
      .eq('id', refs.contact_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Contact invalid pentru aceasta agentie' }, { status: 400 });
  }

  if (refs.agent_id) {
    const { data } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', refs.agent_id)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const { data, error } = await admin
      .from('transactions')
      .select('id, property_id, agent_id, contact_id, type, status, status_reason, sale_price, currency, agency_commission, agent_commission, closed_at, notes, created_at')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('closed_at', { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      if (migrationError(error.message)) return Response.json({ transactions: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ transactions: data || [] });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const b = await request.json();
    const refs = {
      property_id: b.property_id || null,
      contact_id: b.contact_id || null,
      agent_id: b.agent_id || user.id,
    };

    const refsError = await validateRefs(auth.context, refs);
    if (refsError) return refsError;

    const { data, error } = await admin.from('transactions').insert({
      agency_id: agencyId,
      created_by: user.id,
      property_id: refs.property_id,
      agent_id: refs.agent_id,
      contact_id: refs.contact_id,
      type: VALID_TYPE.includes(b.type) ? b.type : 'vanzare',
      status: 'finalizata',
      sale_price: num(b.sale_price),
      currency: b.currency || 'EUR',
      agency_commission: num(b.agency_commission),
      agent_commission: num(b.agent_commission),
      closed_at: b.closed_at || new Date().toISOString().slice(0, 10),
      notes: b.notes?.trim() || null,
    }).select().single();

    if (error) {
      if (migrationError(error.message)) {
        return Response.json({ error: 'Tabela transactions lipseste - ruleaza migrarea SQL in Supabase.' }, { status: 503 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ transaction: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const b = await request.json();
    const { id } = b;
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: existing } = await admin
      .from('transactions')
      .select('id, status')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'Tranzactie negasita' }, { status: 404 });

    if (b.status !== undefined) {
      if (!isTransactionStatus(b.status)) {
        return Response.json({ error: 'Status de tranzacție invalid' }, { status: 400 });
      }
      if (!isTransactionStatus(existing.status) || !canTransition(TRANSACTION_STATUS_TRANSITIONS, existing.status, b.status)) {
        return Response.json({ error: `Tranziția de la ${existing.status} la ${b.status} nu este permisă` }, { status: 409 });
      }
    }

    const refsError = await validateRefs(auth.context, {
      property_id: b.property_id,
      contact_id: b.contact_id,
      agent_id: b.agent_id,
    });
    if (refsError) return refsError;

    const safe: Record<string, unknown> = {};
    if (b.property_id !== undefined) safe.property_id = b.property_id || null;
    if (b.agent_id !== undefined) safe.agent_id = b.agent_id || null;
    if (b.contact_id !== undefined) safe.contact_id = b.contact_id || null;
    if (b.type !== undefined) safe.type = VALID_TYPE.includes(b.type) ? b.type : 'vanzare';
    if (b.sale_price !== undefined) safe.sale_price = num(b.sale_price);
    if (b.currency !== undefined) safe.currency = b.currency || 'EUR';
    if (b.agency_commission !== undefined) safe.agency_commission = num(b.agency_commission);
    if (b.agent_commission !== undefined) safe.agent_commission = num(b.agent_commission);
    if (b.closed_at !== undefined) safe.closed_at = b.closed_at || null;
    if (b.notes !== undefined) safe.notes = b.notes?.trim() || null;
    if (b.status !== undefined) safe.status = b.status;
    if (b.status_reason !== undefined) safe.status_reason = b.status_reason?.trim() || null;

    const { data, error } = await admin
      .from('transactions')
      .update(safe)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ transaction: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: existing } = await admin
      .from('transactions')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'Tranzactie negasita' }, { status: 404 });

    const { error } = await admin
      .from('transactions')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
