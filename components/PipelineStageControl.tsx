'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, X } from 'lucide-react';

import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_TRANSITIONS,
  pipelineMeta,
  pipelineStage,
  type LeadPipelineCode,
} from '@/lib/crm-pipeline';
import { supabase } from '@/lib/supabase';

type PipelineLead = {
  id: string;
  status?: string | null;
  pipeline_stage?: string | null;
  next_action_at?: string | null;
  next_action_type?: string | null;
};

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
}

export function PipelineStageControl({
  lead,
  onChanged,
  compact = false,
}: {
  lead: PipelineLead;
  onChanged?: (stage: LeadPipelineCode, changedAt?: string) => void;
  compact?: boolean;
}) {
  const current = pipelineStage(lead.pipeline_stage, lead.status);
  const currentMeta = pipelineMeta(current);
  const [target, setTarget] = useState<LeadPipelineCode | null>(null);
  const [nextActionAt, setNextActionAt] = useState(() => localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [nextActionType, setNextActionType] = useState(lead.next_action_type || 'follow_up');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => [current, ...LEAD_PIPELINE_TRANSITIONS[current]]
      .map((code) => LEAD_PIPELINE_STAGES.find((stage) => stage.code === code))
      .filter((stage): stage is typeof LEAD_PIPELINE_STAGES[number] => Boolean(stage)),
    [current],
  );
  const targetMeta = target ? pipelineMeta(target) : null;

  const openTransition = (value: string) => {
    if (value === current) return;
    setTarget(value as LeadPipelineCode);
    setBlockers([]);
    setError('');
    setReason('');
    setNote('');
    setNextActionAt(localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  };

  const save = async () => {
    if (!target || !targetMeta) return;
    if (targetMeta.requiresNextAction && !nextActionAt) {
      setError('Completează termenul următoarei acțiuni.');
      return;
    }
    setSaving(true);
    setError('');
    setBlockers([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/leads/pipeline', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: lead.id,
          stage: target,
          next_action_at: targetMeta.requiresNextAction
            ? new Date(nextActionAt).toISOString()
            : null,
          next_action_type: targetMeta.requiresNextAction ? nextActionType : null,
          reason: target === 'pierdut' ? reason : null,
          note: target === 'pierdut' ? note : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setBlockers(Array.isArray(result.blockers) ? result.blockers : []);
        throw new Error(result.error || 'Etapa nu a putut fi schimbată.');
      }
      onChanged?.(target, result.lead?.pipeline_stage_changed_at);
      setTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Etapa nu a putut fi schimbată.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <select
        aria-label="Etapă pipeline"
        value={current}
        onChange={(event) => openTransition(event.target.value)}
        className={`${compact ? 'max-w-[11rem] text-xs' : 'text-sm'} rounded-lg border border-gray-200 bg-white px-2 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${currentMeta.color}`}
      >
        {options.map((stage) => (
          <option key={stage.code} value={stage.code}>{stage.label}</option>
        ))}
      </select>

      {targetMeta && (
        <div className="mobile-dialog-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="mobile-dialog-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-gray-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schimbare controlată</p>
                <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-bold text-gray-950">
                  {currentMeta.label} <ArrowRight size={18} /> {targetMeta.label}
                </h2>
              </div>
              <button type="button" onClick={() => setTarget(null)} className="mobile-touch-target rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Închide">
                <X size={20} />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-blue-950">
                  <CheckCircle2 size={16} /> Condiția de intrare
                </p>
                <p className="mt-1 text-sm text-blue-900">{targetMeta.entryCondition}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Acțiuni obligatorii</p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {targetMeta.mandatoryActions.map((action) => <li key={action}>• {action}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Automatizare asociată</p>
                  <p className="mt-2 text-sm text-gray-700">{targetMeta.automation}</p>
                </div>
              </div>

              {targetMeta.requiresNextAction && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Următoarea acțiune *</label>
                    <select value={nextActionType} onChange={(event) => setNextActionType(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="first_contact">Prim contact</option>
                      <option value="follow_up">Revenire</option>
                      <option value="send_offers">Trimite proprietăți</option>
                      <option value="viewing">Vizionare</option>
                      <option value="offer">Ofertă / negociere</option>
                      <option value="documents">Documente</option>
                      <option value="notary">Notar</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Termen *</label>
                    <input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {target === 'pierdut' && (
                <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-red-800">Motivul pierderii *</label>
                    <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-red-800">Observație *</label>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {(error || blockers.length > 0) && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="flex items-center gap-2 font-semibold"><AlertCircle size={16} />{error}</p>
                  {blockers.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-6">
                      {blockers.map((blocker) => <li key={blocker} className="list-disc">{blocker}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-gray-200 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTarget(null)} className="mobile-touch-target rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Anulare</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="mobile-touch-target rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Se verifică...' : 'Verifică și schimbă etapa'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
