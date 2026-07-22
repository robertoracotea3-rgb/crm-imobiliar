'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Loader2, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';

type LeadForViewing = {
  id: string;
  contact_id?: string;
  contact_name: string;
  contact_phone?: string;
  property_id?: string;
  property_title?: string;
  agent_id?: string;
};

type PropertyOption = {
  id: string;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
  address?: string | null;
};

const localDateTime = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

export function ScheduleViewingDialog({
  lead,
  onClose,
  onSuccess,
}: {
  lead: LeadForViewing;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState(lead.property_id || '');
  const [startAt, setStartAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('120');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const date = new Date(Date.now() + 60 * 60 * 1000);
      date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
      setStartAt(localDateTime(date));
    }, 0);
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch('/api/properties/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!cancelled && response.ok) setProperties(data.properties || []);
    });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  const selectedProperty = properties.find((property) => property.id === propertyId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const start = new Date(startAt);
    if (!propertyId) { setError('Selectează proprietatea'); return; }
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      setError('Vizionarea trebuie programată în viitor');
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat');
      const reminder = new Date(start.getTime() - Number(reminderMinutes) * 60_000);
      const response = await fetch('/api/viewings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          contact_id: lead.contact_id || null,
          property_id: propertyId,
          agent_id: lead.agent_id || null,
          start_at: start.toISOString(),
          duration_minutes: Number(duration),
          location: location || selectedProperty?.address || selectedProperty?.city || null,
          description,
          participants: participants.split(',').map((value) => value.trim()).filter(Boolean),
          reminder_at: reminder.getTime() > Date.now() ? reminder.toISOString() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Vizionarea nu a putut fi salvată');
      onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vizionarea nu a putut fi salvată');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="font-bold text-gray-900">Programează vizionare</h3>
            <p className="text-xs text-gray-500">{lead.contact_name}{lead.contact_phone ? ` · ${lead.contact_phone}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={18} /></button>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Proprietate *</label>
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selectează proprietatea</option>
              {lead.property_id && !properties.some((property) => property.id === lead.property_id) && (
                <option value={lead.property_id}>{lead.property_title || 'Proprietatea leadului'}</option>
              )}
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.internal_code ? `${property.internal_code} · ` : ''}{property.title || 'Fără titlu'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Data și ora *</label>
              <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Durată</label>
              <select value={duration} onChange={(event) => setDuration(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="30">30 minute</option><option value="45">45 minute</option><option value="60">60 minute</option><option value="90">90 minute</option><option value="120">2 ore</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Locație</label>
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={selectedProperty?.city || 'Adresa întâlnirii'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Participanți</label>
            <input value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Nume separate prin virgulă" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Reminder</label>
              <select value={reminderMinutes} onChange={(event) => setReminderMinutes(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="30">30 min înainte</option><option value="60">1 oră înainte</option><option value="120">2 ore înainte</option><option value="1440">1 zi înainte</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Observații</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? <Loader2 size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
            {saving ? 'Se salvează…' : 'Salvează în calendar'}
          </button>
        </form>
      </div>
    </div>
  );
}
