'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Clock, ExternalLink, Filter, Phone, RefreshCw, UserRound } from 'lucide-react';

import { PipelineStageControl } from '@/components/PipelineStageControl';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  LEAD_PIPELINE_STAGES,
  pipelineStage,
  type LeadPipelineCode,
} from '@/lib/crm-pipeline';
import { supabase } from '@/lib/supabase';

type PipelineLead = {
  id: string;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  agent_id?: string | null;
  status?: string | null;
  pipeline_stage?: string | null;
  pipeline_stage_changed_at?: string | null;
  next_action_at?: string | null;
  next_action_type?: string | null;
  property_id?: string | null;
  property_title?: string | null;
  property_code?: string | null;
  city?: string | null;
  category?: string | null;
};

function nextActionLabel(value?: string | null) {
  if (!value) return 'Fără termen';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Termen invalid';
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/leads/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Pipeline-ul nu a putut fi încărcat.');
      setLeads(result.leads || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pipeline-ul nu a putut fi încărcat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const agents = useMemo(() => [...new Set(leads.map((lead) => lead.agent_id).filter(Boolean))] as string[], [leads]);
  const filtered = useMemo(() => leads.filter((lead) => {
    const stage = pipelineStage(lead.pipeline_stage, lead.status);
    return (!agentFilter || lead.agent_id === agentFilter) && (!stageFilter || stage === stageFilter);
  }), [agentFilter, leads, stageFilter]);

  const byStage = useMemo(() => {
    const groups = new Map<LeadPipelineCode, PipelineLead[]>();
    for (const stage of LEAD_PIPELINE_STAGES) groups.set(stage.code, []);
    for (const lead of filtered) {
      groups.get(pipelineStage(lead.pipeline_stage, lead.status))?.push(lead);
    }
    return groups;
  }, [filtered]);

  const updateStage = (leadId: string, stage: LeadPipelineCode, changedAt?: string) => {
    setLeads((current) => current.map((lead) => lead.id === leadId
      ? { ...lead, pipeline_stage: stage, pipeline_stage_changed_at: changedAt || new Date().toISOString() }
      : lead));
  };

  return (
    <ProtectedLayout module="leads">
      <main className="min-w-0 p-4 sm:p-6">
        <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Flux operațional verificabil</p>
            <h1 className="mt-1 text-3xl font-black text-gray-950">Pipeline clienți</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Etapele istorice rămân intacte. O etapă nouă se activează numai dacă datele și obiectele reale necesare există în CRM.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 xl:w-auto">
            <Link href="/clients" className="mobile-touch-target flex flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 xl:flex-none">
              Lista clienți
            </Link>
            <button type="button" onClick={() => void load()} className="mobile-touch-target flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white xl:flex-none">
              <RefreshCw size={16} /> Reîncarcă
            </button>
          </div>
        </header>

        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <Filter size={16} className="text-gray-500" />
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm sm:flex-none">
            <option value="">Toate etapele</option>
            {LEAD_PIPELINE_STAGES.map((stage) => <option key={stage.code} value={stage.code}>{stage.label}</option>)}
          </select>
          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm sm:flex-none">
            <option value="">Toți agenții</option>
            {agents.map((agent) => <option key={agent} value={agent}>{agent.slice(0, 8)}…</option>)}
          </select>
          <span className="ml-auto text-sm font-semibold text-gray-600">{filtered.length} leaduri</span>
        </section>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain pb-4">
            <div className="flex min-w-max items-start gap-3">
              {LEAD_PIPELINE_STAGES
                .filter((stage) => !stageFilter || stage.code === stageFilter)
                .map((stage) => {
                  const rows = byStage.get(stage.code) || [];
                  return (
                    <section key={stage.code} className="w-[min(88vw,19rem)] flex-none rounded-2xl border border-gray-200 bg-gray-50/80">
                      <header className="sticky top-0 z-10 rounded-t-2xl border-b border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className={`rounded-full px-2.5 py-1 text-xs font-bold ${stage.color}`}>{stage.label}</h2>
                          <span className="text-xs font-bold text-gray-500">{rows.length}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-gray-500" title={stage.entryCondition}>{stage.entryCondition}</p>
                      </header>
                      <div className="max-h-[calc(100dvh-18rem)] space-y-2 overflow-y-auto p-2">
                        {rows.map((lead) => (
                          <article key={lead.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              {lead.contact_id ? (
                                <Link href={`/clients/${lead.contact_id}`} className="min-w-0 truncate text-sm font-bold text-gray-950 hover:text-emerald-700 hover:underline">
                                  {lead.contact_name || 'Client fără nume'}
                                </Link>
                              ) : (
                                <span className="min-w-0 truncate text-sm font-bold text-gray-950">{lead.contact_name || 'Client fără nume'}</span>
                              )}
                              <UserRound size={15} className="flex-none text-gray-400" />
                            </div>
                            {lead.contact_phone && <a href={`tel:${lead.contact_phone}`} className="mt-1 flex items-center gap-1 text-xs text-gray-600 hover:text-emerald-700"><Phone size={12} />{lead.contact_phone}</a>}
                            {(lead.city || lead.category) && <p className="mt-2 text-xs text-gray-500">{[lead.city, lead.category?.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</p>}
                            {lead.property_id && (
                              <Link href={`/properties/${lead.property_id}`} className="mt-2 flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                                <Building2 size={13} />
                                <span className="truncate">{lead.property_code || lead.property_title || 'Proprietate'}</span>
                                <ExternalLink size={11} className="ml-auto flex-none" />
                              </Link>
                            )}
                            <p className={`mt-2 flex items-center gap-1 text-xs ${lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now() ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                              <Clock size={12} /> {nextActionLabel(lead.next_action_at)}
                            </p>
                            <div className="mt-3 border-t border-gray-100 pt-3">
                              <PipelineStageControl
                                lead={lead}
                                compact
                                onChanged={(next, changedAt) => updateStage(lead.id, next, changedAt)}
                              />
                            </div>
                          </article>
                        ))}
                        {rows.length === 0 && <p className="px-2 py-8 text-center text-xs text-gray-400">Niciun lead</p>}
                      </div>
                    </section>
                  );
                })}
            </div>
          </div>
        )}
      </main>
    </ProtectedLayout>
  );
}
