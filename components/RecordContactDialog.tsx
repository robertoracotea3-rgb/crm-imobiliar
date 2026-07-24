'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareText, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';

type Lead = {
  id: string;
  contact_name: string;
  property_id?: string;
  property_title?: string;
  city?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
};

type PropertyOption = {
  id: string;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
};

type Props = {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const SUCCESSFUL_OUTCOMES = new Set([
  'connected_interested',
  'connected_followup',
  'connected_not_interested',
]);

const fieldClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

function futureLocalDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function RecordContactDialog({ lead, isOpen, onClose, onSuccess }: Props) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [channel, setChannel] = useState('phone');
  const [outcome, setOutcome] = useState('connected_interested');
  const [description, setDescription] = useState('');
  const [clientNeed, setClientNeed] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [city, setCity] = useState('');
  const [zone, setZone] = useState('');
  const [nextActionType, setNextActionType] = useState('follow_up');
  const [nextActionAt, setNextActionAt] = useState(futureLocalDate);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const successful = SUCCESSFUL_OUTCOMES.has(outcome);

  useEffect(() => {
    if (!isOpen || !lead) return;
    const timer = window.setTimeout(() => {
      setChannel('phone');
      setOutcome('connected_interested');
      setDescription('');
      setClientNeed('');
      setPropertyId(lead.property_id || '');
      setBudgetMin(lead.budget_min?.toString() || '');
      setBudgetMax(lead.budget_max?.toString() || '');
      setCurrency(lead.currency || 'EUR');
      setCity(lead.city || '');
      setZone('');
      setNextActionType('follow_up');
      setNextActionAt(futureLocalDate());
      setIdempotencyKey(crypto.randomUUID());
      setError('');
    }, 0);

    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch('/api/properties/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!cancelled && response.ok) setProperties(data.properties || []);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, lead]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === propertyId),
    [properties, propertyId],
  );

  const save = async () => {
    if (!lead) return;
    if (!description.trim() || (successful && !clientNeed.trim())) {
      setError(successful
        ? 'Descrierea conversației și ce dorește clientul sunt obligatorii.'
        : 'Descrierea încercării este obligatorie.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/leads/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          channel,
          outcome,
          description,
          client_need: clientNeed,
          property_id: propertyId || null,
          budget_min: budgetMin || null,
          budget_max: budgetMax || null,
          currency,
          city,
          zone,
          next_action_type: nextActionType,
          next_action_at: new Date(nextActionAt).toISOString(),
          occurred_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Interacțiunea nu a putut fi salvată.');
      onSuccess?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Interacțiunea nu a putut fi salvată.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="mobile-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-200 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-emerald-900">
              <MessageSquareText size={21} /> Înregistrează contactul
            </h2>
            <p className="mt-1 text-sm text-gray-500">{lead.contact_name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={20} /></button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Canal folosit *
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="phone">Telefon</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="in_person">Întâlnire</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Rezultatul contactării *
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="connected_interested">Contactat · interesat</option>
              <option value="connected_followup">Contactat · revenire programată</option>
              <option value="connected_not_interested">Contactat · nu mai este interesat</option>
              <option value="no_answer">Nu a răspuns</option>
              <option value="unreachable">Nu poate fi contactat</option>
              <option value="wrong_number">Număr greșit</option>
              <option value="message_sent_waiting_reply">Mesaj trimis · așteptăm răspuns</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Descrierea conversației sau încercării *
            <textarea value={description} onChange={(event) => setDescription(event.target.value)}
              rows={4} maxLength={4000} className={`${fieldClass} mt-1`}
              placeholder="Scrie concret ce s-a discutat sau ce s-a întâmplat. Un click pe telefon/WhatsApp nu completează automat acest câmp." />
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Ce dorește clientul {successful ? '*' : ''}
            <textarea value={clientNeed} onChange={(event) => setClientNeed(event.target.value)}
              rows={2} maxLength={2000} className={`${fieldClass} mt-1`}
              placeholder={successful ? 'Tip proprietate, scop, criterii importante…' : 'Completează dacă informația este cunoscută.'} />
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Proprietatea discutată
            <select value={propertyId} onChange={(event) => {
              const value = event.target.value;
              setPropertyId(value);
              const property = properties.find((item) => item.id === value);
              if (property?.city) setCity(property.city);
            }} className={`${fieldClass} mt-1`}>
              <option value="">Fără proprietate specifică</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {[property.internal_code, property.title, property.city].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
            {selectedProperty && <span className="mt-1 block text-xs text-gray-500">{selectedProperty.title}</span>}
          </label>

          <label className="text-sm font-medium text-gray-700">
            Buget minim
            <input type="number" min="0" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} className={`${fieldClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Buget maxim
            <div className="mt-1 flex gap-2">
              <input type="number" min="0" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} className={fieldClass} />
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="rounded-lg border border-gray-300 px-2 text-sm">
                <option>EUR</option><option>RON</option>
              </select>
            </div>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Localitate
            <input value={city} onChange={(event) => setCity(event.target.value)} className={`${fieldClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Zonă
            <input value={zone} onChange={(event) => setZone(event.target.value)} className={`${fieldClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Următoarea acțiune *
            <select value={nextActionType} onChange={(event) => setNextActionType(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="follow_up">Revenire la client</option>
              <option value="send_properties">Trimite proprietăți</option>
              <option value="schedule_viewing">Programează vizionare</option>
              <option value="request_documents">Solicită documente</option>
              <option value="close_review">Verifică închiderea</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Data următoarei acțiuni *
            <input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} className={`${fieldClass} mt-1`} />
          </label>
        </div>

        {error && <p className="mx-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <footer className="flex gap-3 p-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50">Anulează</button>
          <button type="button" onClick={() => void save()} disabled={saving || !nextActionAt}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} Salvează interacțiunea
          </button>
        </footer>
      </div>
    </div>
  );
}
