'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, Users } from 'lucide-react';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { supabase } from '@/lib/supabase';

type Contact = {
  id: string; full_name: string; phone?: string | null; phone_secondary?: string | null;
  email?: string | null; source?: string | null; created_at: string; merge_status: string;
};
type Candidate = {
  id: string; confidence: number; reasons: string[]; status: string; detected_at: string;
  primary: Contact | null; duplicate: Contact | null;
};
type Operation = {
  id: string; primary_contact_id: string; merged_contact_id: string; reason: string;
  status: string; merged_at: string; reverted_at?: string | null;
};

const reasonLabel: Record<string, string> = {
  same_phone: 'același telefon', same_email: 'același e-mail', same_portal_client: 'același ID portal',
};

export default function ClientDuplicatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const response = await fetch('/api/clients/duplicates?status=pending', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Duplicatele nu au putut fi încărcate');
      setCandidates(data.candidates || []);
      setOperations(data.operations || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Duplicatele nu au putut fi încărcate');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const merge = async (candidate: Candidate, reverse = false) => {
    if (!candidate.primary || !candidate.duplicate) return;
    const reason = window.prompt('Motivul unirii (va fi păstrat în audit):', 'Aceeași persoană, verificată manual')?.trim();
    if (!reason) return;
    const primary = reverse ? candidate.duplicate : candidate.primary;
    const duplicate = reverse ? candidate.primary : candidate.duplicate;
    if (!window.confirm(`Păstrăm profilul „${primary.full_name}” și unim în el „${duplicate.full_name}”? Toate legăturile istorice vor fi păstrate.`)) return;
    setWorking(candidate.id); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const response = await fetch('/api/clients/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'merge', primary_contact_id: primary.id, duplicate_contact_id: duplicate.id, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Profilurile nu au putut fi unite');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Eroare la unire'); }
    finally { setWorking(null); }
  };

  const revert = async (operation: Operation) => {
    const reason = window.prompt('De ce anulezi unirea?')?.trim();
    if (!reason) return;
    setWorking(operation.id); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const response = await fetch('/api/clients/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'revert', operation_id: operation.id, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unirea nu a putut fi anulată');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Eroare la restaurare'); }
    finally { setWorking(null); }
  };

  const reject = async (candidate: Candidate) => {
    const reason = window.prompt('De ce nu sunt aceeași persoană?')?.trim();
    if (!reason) return;
    setWorking(candidate.id); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const response = await fetch('/api/clients/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'reject', candidate_id: candidate.id, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Propunerea nu a putut fi respinsă');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Eroare la respingere'); }
    finally { setWorking(null); }
  };

  return <ProtectedLayout module="contacts">
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><ArrowLeft size={16} />Înapoi la clienți</Link>
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Users className="text-emerald-700" />Duplicate clienți</h1>
        <p className="mt-1 text-sm text-gray-500">Sistemul doar propune. Unirea se face exclusiv după verificarea ta și poate fi anulată.</p>
      </header>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {loading ? <div className="py-16 text-center text-gray-500"><Loader2 className="mx-auto mb-2 animate-spin" />Se verifică…</div> : candidates.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-900">Nu există propuneri de duplicate care așteaptă verificarea.</div> : <div className="space-y-4">
        {candidates.map((candidate) => <section key={candidate.id} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /><span className="font-bold text-gray-900">Potrivire {candidate.confidence}%</span><span className="text-xs text-gray-500">{candidate.reasons.map((reason) => reasonLabel[reason] || reason).join(', ')}</span></div>
          <div className="grid gap-3 md:grid-cols-2">{[candidate.primary, candidate.duplicate].map((contact, index) => contact && <article key={contact.id} className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profil {index + 1}</p><Link href={`/clients/${contact.id}`} className="mt-1 block font-bold text-emerald-800 hover:underline">{contact.full_name}</Link><p className="mt-2 text-sm text-gray-600">{contact.phone || 'Fără telefon'}</p><p className="text-sm text-gray-600">{contact.email || 'Fără e-mail'}</p><p className="mt-2 text-xs text-gray-400">Creat {new Date(contact.created_at).toLocaleDateString('ro-RO')}</p></article>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button disabled={working === candidate.id} onClick={() => merge(candidate)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Păstrează profilul 1</button><button disabled={working === candidate.id} onClick={() => merge(candidate, true)} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Păstrează profilul 2</button><button disabled={working === candidate.id} onClick={() => reject(candidate)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">Nu sunt aceeași persoană</button></div>
        </section>)}
      </div>}

      {operations.some((operation) => operation.status === 'merged') && <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="mb-3 font-bold text-gray-900">Uniri recente care pot fi anulate</h2><div className="space-y-2">{operations.filter((operation) => operation.status === 'merged').map((operation) => <div key={operation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"><div><p className="text-sm font-medium text-gray-800">{operation.reason}</p><p className="text-xs text-gray-400">{new Date(operation.merged_at).toLocaleString('ro-RO')}</p></div><button onClick={() => revert(operation)} disabled={working === operation.id} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><RotateCcw size={14} />Anulează unirea</button></div>)}</div></section>}
    </div>
  </ProtectedLayout>;
}
