'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RotateCcw, X } from 'lucide-react';

import {
  DEMAND_CLOSE_REASONS,
  DEMAND_CLOSED_STATUS,
  DEMAND_REVIEW_STATUS,
  type DemandCloseReason,
  type DemandReviewAction,
} from '@/lib/demand-review';
import { supabase } from '@/lib/supabase';

type Demand = {
  id: string;
  internal_code?: string | null;
  status?: string | null;
  review_marked_at?: string | null;
  last_relevant_activity_at?: string | null;
  close_reason_code?: string | null;
  close_reason_note?: string | null;
};

export function DemandReviewDialog({
  demand,
  onClose,
  onSaved,
}: {
  demand: Demand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isClosed = [
    DEMAND_CLOSED_STATUS, 'closed', 'indeplinita', 'anulata',
  ].includes(demand.status || '');
  const actions = useMemo(() => isClosed
    ? [{ code: 'reopen', label: 'Reactivează cererea', icon: RotateCcw }]
    : [
        { code: 'extend', label: 'Prelungește cererea', icon: Clock3 },
        { code: 'activity', label: 'Adaugă activitate', icon: CheckCircle2 },
        { code: 'close', label: 'Închide cererea', icon: X },
      ], [isClosed]);
  const [action, setAction] = useState<DemandReviewAction>(
    isClosed ? 'reopen' : 'extend',
  );
  const [reasonCode, setReasonCode] = useState<DemandCloseReason>(
    DEMAND_CLOSE_REASONS[0].code,
  );
  const [note, setNote] = useState('');
  const [nextActionType, setNextActionType] = useState('follow_up');
  const [nextActionAt, setNextActionAt] = useState(() => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString().slice(0, 16);
  });
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (action === 'close' && reasonCode === 'alt_motiv' && note.trim().length < 5) {
      setError('Explică motivul închiderii.');
      return;
    }
    if (action === 'activity' && note.trim().length < 5) {
      setError('Descrie activitatea realizată.');
      return;
    }
    if (action === 'reopen' && note.trim().length < 5) {
      setError('Explică de ce reactivezi cererea.');
      return;
    }
    setSaving(true);
    setError('');
    setBlockers([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/demands/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          demand_id: demand.id,
          action,
          reason_code: action === 'close' ? reasonCode : null,
          note: note.trim() || null,
          next_action_type: action === 'close' ? null : nextActionType,
          next_action_at: action === 'close'
            ? null
            : new Date(nextActionAt).toISOString(),
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setBlockers(Array.isArray(data.blockers) ? data.blockers : []);
        throw new Error(data.error || 'Revizuirea nu a putut fi salvată.');
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Revizuirea nu a putut fi salvată.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="mobile-dialog-panel w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">
              {isClosed ? 'Reactivează cererea' : 'Revizuiește cererea'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">{demand.internal_code || 'Cerere client'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Închide">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!isClosed && demand.status !== DEMAND_REVIEW_STATUS && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Cererea nu este încă marcată pentru revizuire.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {actions.map(({ code, label, icon: Icon }) => (
              <button
                key={code}
                onClick={() => {
                  setAction(code as DemandReviewAction);
                  setError('');
                  setBlockers([]);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${
                  action === code
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          {action === 'close' ? (
            <>
              <label className="block text-sm font-medium text-gray-800">
                Motivul închiderii
                <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as DemandCloseReason)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {DEMAND_CLOSE_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Observație {reasonCode === 'alt_motiv' ? '(obligatorie)' : '(opțională)'}
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                Cererea rămâne în istoricul clientului. Nu se șterge.
              </p>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-800">
                {action === 'activity' ? 'Descrierea activității' : action === 'reopen' ? 'Motivul reactivării' : 'Observație'}
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-800">
                  Următoarea acțiune
                  <select value={nextActionType} onChange={(event) => setNextActionType(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="follow_up">Revenire la client</option>
                    <option value="send_properties">Trimite proprietăți</option>
                    <option value="call">Apel telefonic</option>
                    <option value="meeting">Întâlnire</option>
                    <option value="review_criteria">Revizuire criterii</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-800">
                  Data acțiunii
                  <input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
            </>
          )}

          {blockers.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={17} /> Închiderea este blocată:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Renunță</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Confirmă
          </button>
        </div>
      </div>
    </div>
  );
}
