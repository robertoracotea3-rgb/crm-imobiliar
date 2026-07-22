'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, FileText,
  Globe2, History, Home, Loader2, Mail, MapPin, Phone, Target, UserRound,
} from 'lucide-react';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { statusColor, statusLabel } from '@/lib/clients';
import { leadSourceLabel } from '@/lib/crm-catalogs';
import { supabase } from '@/lib/supabase';

type PropertySummary = {
  id: string;
  internal_code?: string | null;
  title?: string | null;
  public_url?: string | null;
};

type ClientProfile = {
  contact: {
    id: string;
    full_name: string;
    phone?: string | null;
    phone_secondary?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    source?: string | null;
    type?: string[] | null;
    gdpr_consent?: boolean | null;
    gdpr_consent_at?: string | null;
    created_at: string;
  };
  sources: { source_code: string; first_seen_at: string; last_seen_at: string }[];
  leads: {
    id: string; status: string; source_normalized?: string | null; source?: string | null;
    message?: string | null; received_at: string; property?: PropertySummary | null;
  }[];
  demands: {
    id: string; internal_code?: string | null; status?: string | null; category?: string | null;
    transaction?: string | null; budget_min?: number | null; budget_max?: number | null;
    currency?: string | null; cities?: string[] | null; created_at: string;
  }[];
  viewings: {
    id: string; title?: string | null; status?: string | null; start_at: string;
    outcome?: string | null; property?: PropertySummary | null;
  }[];
  tasks: { id: string; title: string; status?: string | null; due_at?: string | null }[];
  transactions: {
    id: string; type?: string | null; status?: string | null; sale_price?: number | null;
    currency?: string | null; closed_at?: string | null; created_at: string;
  }[];
  documents: { id: string; property_id: string; category: string; file_name: string; created_at: string }[];
  owned_properties: (PropertySummary & { status?: string | null; city?: string | null })[];
  timeline: {
    id: string; kind: string; title: string; description?: string | null;
    occurred_at: string; entity_id: string;
  }[];
  summary: Record<'leads' | 'demands' | 'viewings' | 'tasks' | 'transactions' | 'owned_properties' | 'documents', number>;
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const money = (value?: number | null, currency = 'EUR') => typeof value === 'number'
  ? `${value.toLocaleString('ro-RO')} ${currency}`
  : '—';

const section = 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm';

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const response = await fetch(`/api/clients/${params.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Profilul nu a putut fi încărcat');
      setProfile(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profilul nu a putut fi încărcat');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <ProtectedLayout module="contacts">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900">
          <ArrowLeft size={16} /> Înapoi la clienți
        </Link>

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center text-gray-500"><Loader2 className="mr-2 animate-spin" />Se încarcă profilul…</div>
        ) : error || !profile ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>{error || 'Profil indisponibil'}</p>
            <button onClick={load} className="mt-3 text-sm font-semibold underline">Reîncearcă</button>
          </div>
        ) : (
          <>
            <header className="rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-5 text-white shadow-sm md:p-7">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-xl font-bold">
                    {profile.contact.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold md:text-3xl">{profile.contact.full_name}</h1>
                    <p className="mt-1 text-sm text-emerald-100">Profil unic client · din {new Date(profile.contact.created_at).toLocaleDateString('ro-RO')}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {profile.contact.phone && <a href={`tel:${profile.contact.phone}`} className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25"><Phone size={15} className="mr-1 inline" />Sună</a>}
                  {profile.contact.email && <a href={`mailto:${profile.contact.email}`} className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25"><Mail size={15} className="mr-1 inline" />Email</a>}
                </div>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ['Leaduri', profile.summary.leads, UserRound],
                ['Cereri', profile.summary.demands, Target],
                ['Vizionări', profile.summary.viewings, CalendarDays],
                ['Taskuri', profile.summary.tasks, CheckCircle2],
                ['Tranzacții', profile.summary.transactions, FileText],
                ['Proprietăți', profile.summary.owned_properties, Home],
              ].map(([label, value, Icon]) => {
                const CardIcon = Icon as typeof UserRound;
                return <div key={String(label)} className={section}><CardIcon size={18} className="mb-2 text-emerald-700" /><p className="text-2xl font-bold text-gray-900">{String(value)}</p><p className="text-xs text-gray-500">{String(label)}</p></div>;
              })}
            </div>

            <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
              <aside className="space-y-5">
                <section className={section}>
                  <h2 className="mb-4 font-bold text-gray-900">Date client</h2>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p className="flex gap-2"><Phone size={16} className="mt-0.5 text-emerald-700" /><span>{profile.contact.phone || 'Fără telefon'}{profile.contact.phone_secondary ? <><br />{profile.contact.phone_secondary}</> : null}</span></p>
                    <p className="flex gap-2"><Mail size={16} className="mt-0.5 text-emerald-700" /><span className="break-all">{profile.contact.email || 'Fără e-mail'}</span></p>
                    <p className="flex gap-2"><MapPin size={16} className="mt-0.5 text-emerald-700" /><span>{profile.contact.address || 'Adresă necompletată'}</span></p>
                    <p className="flex gap-2"><Globe2 size={16} className="mt-0.5 text-emerald-700" /><span>{profile.sources.length ? profile.sources.map((source) => leadSourceLabel(source.source_code)).join(', ') : leadSourceLabel(profile.contact.source)}</span></p>
                  </div>
                  {profile.contact.notes && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{profile.contact.notes}</p>}
                </section>

                <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Consimțământ</h2>
                  <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${profile.contact.gdpr_consent ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {profile.contact.gdpr_consent ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                    {profile.contact.gdpr_consent ? 'Consimțământ înregistrat' : 'Neînregistrat'}
                  </p>
                  {profile.contact.gdpr_consent_at && <p className="mt-2 text-xs text-gray-500">{formatDate(profile.contact.gdpr_consent_at)}</p>}
                </section>

                {profile.owned_properties.length > 0 && <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Proprietăți deținute</h2>
                  <div className="space-y-2">{profile.owned_properties.map((property) => <Link key={property.id} href={`/properties/${property.id}`} className="block rounded-lg border border-gray-100 p-3 hover:border-emerald-300"><p className="text-sm font-semibold">{property.internal_code ? `${property.internal_code} · ` : ''}{property.title}</p><p className="text-xs text-gray-500">{property.city || 'Fără localitate'} · {property.status}</p></Link>)}</div>
                </section>}
                {profile.documents.length > 0 && <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Documente asociate</h2>
                  <div className="space-y-2">{profile.documents.map((document) => <div key={document.id} className="rounded-lg border border-gray-100 p-3"><p className="text-sm font-semibold text-gray-800">{document.file_name}</p><p className="text-xs text-gray-500">{document.category} · {formatDate(document.created_at)}</p></div>)}</div>
                </section>}
              </aside>

              <main className="space-y-5">
                <section className={section}>
                  <div className="mb-4 flex items-center gap-2"><History size={19} className="text-emerald-700" /><h2 className="font-bold text-gray-900">Istoric cronologic complet</h2></div>
                  {profile.timeline.length === 0 ? <p className="text-sm text-gray-500">Nu există încă activitate.</p> : <ol className="relative ml-2 space-y-5 border-l-2 border-emerald-100">
                    {profile.timeline.map((item) => <li key={item.id} className="ml-5"><span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-emerald-600" /><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold text-gray-900">{item.title}</p><time className="text-xs text-gray-400">{formatDate(item.occurred_at)}</time></div>{item.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.description}</p>}<span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">{item.kind}</span></li>)}
                  </ol>}
                </section>

                <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Leaduri și conversații</h2>
                  <div className="space-y-3">{profile.leads.map((lead) => <article key={lead.id} className="rounded-xl border border-gray-100 p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(lead.status)}`}>{statusLabel(lead.status)}</span><span className="text-xs text-gray-500">{leadSourceLabel(lead.source_normalized || lead.source)}</span><time className="ml-auto text-xs text-gray-400">{formatDate(lead.received_at)}</time></div>{lead.property && <Link href={`/properties/${lead.property.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"><Building2 size={14} />{lead.property.internal_code ? `${lead.property.internal_code} · ` : ''}{lead.property.title}</Link>}{lead.message && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{lead.message}</p>}</article>)}{profile.leads.length === 0 && <p className="text-sm text-gray-500">Niciun lead asociat.</p>}</div>
                </section>

                <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Cereri</h2>
                  <div className="grid gap-3 md:grid-cols-2">{profile.demands.map((demand) => <article key={demand.id} className="rounded-xl border border-gray-100 p-4"><p className="font-semibold text-gray-900">{demand.internal_code || 'Cerere'}</p><p className="mt-1 text-sm text-gray-600">{[demand.transaction, demand.category, ...(demand.cities || [])].filter(Boolean).join(' · ') || 'Criterii necompletate'}</p><p className="mt-2 text-sm font-medium text-emerald-700">{money(demand.budget_min, demand.currency || 'EUR')} – {money(demand.budget_max, demand.currency || 'EUR')}</p></article>)}{profile.demands.length === 0 && <p className="text-sm text-gray-500">Nicio cerere asociată.</p>}</div>
                </section>

                <section className={section}>
                  <h2 className="mb-3 font-bold text-gray-900">Vizionări și tranzacții</h2>
                  <div className="space-y-3">{profile.viewings.map((viewing) => <article key={viewing.id} className="rounded-xl border border-gray-100 p-4"><div className="flex justify-between gap-2"><p className="font-semibold">{viewing.title || 'Vizionare'}</p><span className="text-xs text-gray-500">{viewing.status}</span></div><p className="mt-1 text-sm text-gray-600">{formatDate(viewing.start_at)}</p>{viewing.property && <Link href={`/properties/${viewing.property.id}`} className="mt-1 inline-block text-sm text-emerald-700 hover:underline">{viewing.property.title}</Link>}</article>)}{profile.transactions.map((transaction) => <article key={transaction.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><div className="flex justify-between gap-2"><p className="font-semibold capitalize">Tranzacție · {transaction.type}</p><span className="text-xs text-gray-500">{transaction.status}</span></div><p className="mt-1 text-sm font-semibold text-emerald-800">{money(transaction.sale_price, transaction.currency || 'EUR')}</p></article>)}{profile.viewings.length === 0 && profile.transactions.length === 0 && <p className="text-sm text-gray-500">Nu există vizionări sau tranzacții asociate.</p>}</div>
                </section>
              </main>
            </div>
          </>
        )}
      </div>
    </ProtectedLayout>
  );
}
