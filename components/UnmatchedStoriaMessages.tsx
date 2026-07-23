'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  Loader2,
  Search,
  User,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

type UnmatchedMessage = {
  id: string;
  kind: 'queue' | 'legacy_lead';
  source: string;
  received_at: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  message: string | null;
  portal_ad_id: string | null;
  property_title_hint: string | null;
  reason: string;
};

type PropertyOption = {
  id: string;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
  category?: string | null;
};

const REASON_LABELS: Record<string, string> = {
  historical_lead_without_advert_identity: 'Mesaj istoric fără ID-ul anunțului',
  portal_ad_id_not_found: 'ID-ul anunțului nu există în publicațiile CRM',
  missing_advert_identity: 'Mesajul nu conține un ID de anunț utilizabil',
  listing_without_property: 'Anunțul nu are proprietate asociată',
  listing_property_missing: 'Proprietatea anunțului nu mai există',
  ambiguous_portal_ad_id: 'ID-ul anunțului apare la mai multe publicații',
  ambiguous_external_id: 'UUID-ul anunțului apare la mai multe publicații',
};

const formatDate = (value: string) => new Intl.DateTimeFormat('ro-RO', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

async function authenticatedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesiunea a expirat');
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export function UnmatchedStoriaMessages({ onResolved }: { onResolved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UnmatchedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<UnmatchedMessage | null>(null);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch('/api/portals/storia/unmatched');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Mesajele nu au putut fi încărcate');
      setMessages(data.messages || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMessages(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMessages]);

  const openPropertyPicker = async (message: UnmatchedMessage) => {
    setSelected(message);
    setPropertySearch('');
    if (properties.length) return;
    try {
      const response = await authenticatedFetch('/api/properties/list');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Proprietățile nu au putut fi încărcate');
      setProperties(data.properties || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Eroare la încărcare');
      setSelected(null);
    }
  };

  const filteredProperties = useMemo(() => {
    const term = propertySearch.trim().toLowerCase();
    if (!term) return properties.slice(0, 100);
    return properties.filter((property) => [
      property.internal_code,
      property.title,
      property.city,
      property.category,
    ].some((value) => String(value || '').toLowerCase().includes(term))).slice(0, 100);
  }, [properties, propertySearch]);

  const resolve = async (message: UnmatchedMessage, action: 'link' | 'ignore', propertyId?: string) => {
    let reason: string | undefined;
    if (action === 'ignore') {
      reason = window.prompt('Scrie motivul pentru care mesajul este ignorat:')?.trim();
      if (!reason) return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await authenticatedFetch('/api/portals/storia/unmatched', {
        method: 'PATCH',
        body: JSON.stringify({ id: message.id, action, property_id: propertyId, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Acțiunea nu a putut fi salvată');
      setSelected(null);
      await loadMessages();
      onResolved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle size={18} className="text-amber-700" />
        <span className="font-semibold text-amber-950">Mesaje neasociate</span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
          {loading ? '…' : messages.length}
        </span>
        <span className="ml-auto text-amber-700">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>

      {open && (
        <div className="border-t border-amber-200 p-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Se încarcă…
            </div>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">Toate mesajele Storia sunt asociate.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <article key={message.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-gray-900">
                        <User size={15} /> {message.client_name || message.client_email || message.client_phone || 'Client necunoscut'}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Clock size={12} /> {formatDate(message.received_at)} · {message.source}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                      {message.portal_ad_id ? `Anunț ${message.portal_ad_id}` : 'ID anunț necunoscut'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-700 line-clamp-3">{message.message || 'Mesaj fără text'}</p>
                  <p className="mt-2 text-xs font-medium text-amber-800">
                    Motiv: {REASON_LABELS[message.reason] || message.reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openPropertyPicker(message)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <Link2 size={14} /> Leagă proprietatea
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolve(message, 'ignore')}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Ignoră cu motiv
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="mobile-dialog-panel flex max-h-[86vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="font-bold text-gray-900">Leagă mesajul de proprietate</h3>
                <p className="text-xs text-gray-500">Alege numai proprietatea despre care este mesajul.</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={propertySearch}
                  onChange={(event) => setPropertySearch(event.target.value)}
                  placeholder="Caută după cod, titlu sau localitate"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                {filteredProperties.map((property) => (
                  <button
                    type="button"
                    key={property.id}
                    disabled={saving}
                    onClick={() => void resolve(selected, 'link', property.id)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <p className="font-semibold text-gray-900">
                      {property.internal_code ? `${property.internal_code} · ` : ''}{property.title || 'Proprietate fără titlu'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{[property.city, property.category].filter(Boolean).join(' · ')}</p>
                  </button>
                ))}
                {!filteredProperties.length && <p className="py-8 text-center text-sm text-gray-500">Nicio proprietate găsită.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
