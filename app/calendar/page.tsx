'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  Plus, X, Trash2, Clock, Phone, User, ChevronDown, ChevronUp,
  Circle, CheckCircle2, Filter, Search, UserPlus, MessageSquare,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CalEvent {
  id: string;
  title: string;
  type: string;
  start_at: string;
  end_at?: string;
  description?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_id?: string;
  property_id?: string;
  agent_id?: string;
  all_day?: boolean;
  completed?: boolean;
}

interface ContactOption {
  id: string;
  name: string;
  phone: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { value: 'vizionare',  label: 'Vizionare',            color: 'bg-blue-500',    light: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
  { value: 'preluare',   label: 'Preluare proprietate', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'cerere',     label: 'Cerere nouă',          color: 'bg-purple-500',  light: 'bg-purple-50 text-purple-700 border-purple-200',  dot: 'bg-purple-500' },
  { value: 'intalnire',  label: 'Întâlnire',            color: 'bg-orange-500',  light: 'bg-orange-50 text-orange-700 border-orange-200',  dot: 'bg-orange-500' },
  { value: 'followup',   label: 'Follow-up',            color: 'bg-pink-500',    light: 'bg-pink-50 text-pink-700 border-pink-200',        dot: 'bg-pink-500' },
  { value: 'task',       label: 'Task',                 color: 'bg-gray-500',    light: 'bg-gray-50 text-gray-700 border-gray-200',        dot: 'bg-gray-500' },
];

const DURATIONS = [
  { value: '15',     label: '15 min' },
  { value: '30',     label: '30 min' },
  { value: '45',     label: '45 min' },
  { value: '60',     label: '1 oră' },
  { value: '90',     label: '1h 30min' },
  { value: '120',    label: '2 ore' },
  { value: '180',    label: '3 ore' },
  { value: 'allday', label: 'Toată ziua' },
];

function typeInfo(type: string) {
  return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[5];
}

function computeInitialDuration(event?: CalEvent | null): string {
  if (!event) return '60';
  if (event.all_day) return 'allday';
  if (!event.end_at) return '60';
  const diff = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
  const mins = Math.round(diff / 60000);
  const match = DURATIONS.find(d => d.value !== 'allday' && parseInt(d.value) === mins);
  return match ? match.value : '60';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Azi';
  if (sameDay(d, tomorrow)) return 'Mâine';
  if (sameDay(d, yesterday)) return 'Ieri';
  return d.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function groupByDate(events: CalEvent[]): { label: string; date: string; items: CalEvent[] }[] {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const key = new Date(e.start_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([key, items]) => ({
      label: formatDate(items[0].start_at),
      date: key,
      items: items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    }));
}

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white';

// ── Event Modal ────────────────────────────────────────────────────────────────
function EventModal({
  event, onClose, onSave, onDelete,
}: {
  event?: CalEvent | null;
  onClose: () => void;
  onSave: (data: Partial<CalEvent>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const isNew = !event?.id;
  const defaultDate = new Date().toISOString().slice(0, 16);

  const [form, setForm] = useState({
    title: event?.title || '',
    type: event?.type || 'task',
    start_at: event?.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : defaultDate,
    duration: computeInitialDuration(event),
    description: event?.description || '',
    contact_name: event?.contact_name || '',
    contact_phone: event?.contact_phone || '',
    contact_id: event?.contact_id || '',
    completed: event?.completed || false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Contact search
  const [allContacts, setAllContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState(event?.contact_name || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Quick add contact
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '' });
  const [addingContact, setAddingContact] = useState(false);

  // Load contacts once
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/contacts', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const d = await res.json();
        setAllContacts((d.contacts || []).map((c: { id: string; name: string; phone: string }) => ({
          id: c.id, name: c.name, phone: c.phone || '',
        })));
      }
    })();
  }, []);

  const suggestions = contactSearch.length >= 1
    ? allContacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.phone.includes(contactSearch)
      ).slice(0, 6)
    : [];

  const selectContact = (c: ContactOption) => {
    setForm(p => ({ ...p, contact_name: c.name, contact_phone: c.phone, contact_id: c.id }));
    setContactSearch(c.name);
    setShowDropdown(false);
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim()) return;
    setAddingContact(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: newContact.name.trim(), phone: newContact.phone.trim(), type: 'client' }),
      });
      if (res.ok) {
        const d = await res.json();
        const c = { id: d.contact.id, name: d.contact.name, phone: d.contact.phone || '' };
        setAllContacts(p => [...p, c]);
        selectContact(c);
        setShowAddContact(false);
        setNewContact({ name: '', phone: '' });
      }
    } finally { setAddingContact(false); }
  };

  const handle = async () => {
    if (!form.title.trim()) { setErr('Titlul este obligatoriu'); return; }
    if (form.completed && form.description.trim().length < 70) {
      setErr('Comentariul de finalizare este obligatoriu (minim 70 caractere) — descrie ce s-a întâmplat.'); return;
    }
    setSaving(true); setErr('');
    try {
      const allDay = form.duration === 'allday';
      const endAt = !allDay
        ? new Date(new Date(form.start_at).getTime() + parseInt(form.duration) * 60000).toISOString()
        : null;
      await onSave({
        ...(event?.id ? { id: event.id } : {}),
        title: form.title.trim(),
        type: form.type,
        start_at: form.start_at,
        end_at: endAt ?? undefined,
        all_day: allDay,
        description: form.description.trim() || undefined,
        contact_name: form.contact_name.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        contact_id: form.contact_id || undefined,
        completed: form.completed,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Eroare la salvare');
    } finally { setSaving(false); }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-base">{isNew ? 'Activitate nouă' : 'Editare activitate'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Titlu */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Titlu *</label>
            <input type="text" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="ex: Vizionare apt. 3 cam." className={ic} autoFocus />
          </div>

          {/* Tip */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tip activitate</label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setForm(p => ({ ...p, type: t.value }))}
                  className={`px-2 py-2 text-xs rounded-lg border font-medium transition-colors ${form.type === t.value ? t.light + ' border-current' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data + Durată */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Data și ora</label>
              <input type="datetime-local" value={form.start_at}
                onChange={e => setForm(p => ({ ...p, start_at: e.target.value }))} className={ic} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Durată</label>
              <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} className={ic}>
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Contact</label>
            <div ref={searchRef} className="relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={e => {
                        const v = e.target.value;
                        setContactSearch(v);
                        setForm(p => ({ ...p, contact_name: v, contact_id: '' }));
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                      placeholder="Caută contact din listă..."
                      className={ic + ' pl-8'}
                    />
                  </div>
                  {showDropdown && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {suggestions.map(c => (
                        <button key={c.id} type="button" onMouseDown={() => selectContact(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors">
                          <p className="text-sm font-medium text-gray-900">{c.name}</p>
                          {c.phone && <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowAddContact(v => !v)}
                  title="Adaugă contact nou"
                  className={`px-3 py-2 border rounded-lg text-sm font-bold transition-colors flex items-center gap-1 ${showAddContact ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  <UserPlus size={15} />
                </button>
              </div>

              {/* Quick add contact */}
              {showAddContact && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <UserPlus size={13} /> Contact nou
                  </p>
                  <input type="text" value={newContact.name}
                    onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))}
                    placeholder="Nume *" className={ic} />
                  <input type="tel" value={newContact.phone}
                    onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Telefon" className={ic} />
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={handleAddContact}
                      disabled={addingContact || !newContact.name.trim()}
                      className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 hover:opacity-90 font-medium"
                      style={{ backgroundColor: '#0E6B54' }}>
                      {addingContact ? 'Se adaugă...' : 'Adaugă și selectează'}
                    </button>
                    <button type="button" onClick={() => { setShowAddContact(false); setNewContact({ name: '', phone: '' }); }}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                      Anulare
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Telefon contact */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Telefon contact</label>
            <input type="tel" value={form.contact_phone}
              onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))}
              placeholder="07xx xxx xxx" className={ic} />
          </div>

          {/* Note — obligatoriu la finalizare */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Note{form.completed && <span className="text-red-500 ml-1">* obligatoriu</span>}
            </label>
            <textarea value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder={form.completed ? 'Descrie ce s-a întâmplat (minim 70 caractere)...' : 'Detalii, observații...'}
              rows={3}
              className={ic + (form.completed && form.description.trim().length < 70 ? ' border-amber-400 focus:ring-amber-400' : '')} />
            <div className="flex items-center justify-between mt-1">
              {form.completed && (
                <p className={`text-xs flex items-center gap-1 ${form.description.trim().length >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <MessageSquare size={11} />
                  {form.description.trim().length >= 70 ? 'Comentariu complet ✓' : `Minim 70 caractere la finalizare (${form.description.trim().length}/70)`}
                </p>
              )}
              {form.completed && <span className="text-xs text-gray-400 ml-auto">{form.description.trim().length} car.</span>}
            </div>
          </div>

          {/* Finalizat */}
          <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors select-none border border-gray-200">
            <input type="checkbox" checked={form.completed}
              onChange={e => setForm(p => ({ ...p, completed: e.target.checked }))}
              className="w-4 h-4 rounded accent-emerald-600 cursor-pointer flex-shrink-0" />
            <span className="text-sm font-medium text-gray-800 flex-1">Marchează ca finalizat</span>
            {form.completed && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />}
          </label>

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 items-center flex-shrink-0 bg-white rounded-b-xl">
          {!isNew && onDelete && (
            <button type="button"
              onClick={async () => { if (confirm('Ștergi această activitate?')) { await onDelete(event!.id); onClose(); } }}
              className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1.5 font-medium">
              <Trash2 size={14} /> Șterge
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="px-5 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
            Anulare
          </button>
          <button type="button" onClick={handle} disabled={saving}
            className="px-5 py-2 text-sm text-white rounded-lg disabled:opacity-50 hover:opacity-90 font-semibold"
            style={{ backgroundColor: '#0E6B54' }}>
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Close Comment Modal ────────────────────────────────────────────────────────
function CloseCommentModal({ event, onConfirm, onCancel }: {
  event: CalEvent;
  onConfirm: (comment: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const minLen = 70;

  const handle = async () => {
    if (comment.trim().length < minLen) { setErr(`Minim ${minLen} caractere necesare`); return; }
    setSaving(true); setErr('');
    try { await onConfirm(comment.trim()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Eroare'); setSaving(false); }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Finalizare cerere</h3>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <MessageSquare size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              Activitățile de tip <strong>Cerere</strong> necesită un comentariu obligatoriu la finalizare. Descrie rezultatul sau motivul închiderii.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">Comentariu finalizare *</label>
              <span className={`text-xs ${comment.trim().length >= minLen ? 'text-emerald-600' : 'text-gray-400'}`}>
                {comment.trim().length}/{minLen} min
              </span>
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="ex: Client a găsit o proprietate potrivită, contract semnat..."
              rows={4} autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 resize-none"
            />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 font-medium truncate">
              Cerere: <span className="text-gray-700">{event.title}</span>
            </p>
          </div>
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
            Anulare
          </button>
          <button onClick={handle} disabled={saving || comment.trim().length < minLen}
            className="px-5 py-2 text-sm text-white rounded-lg disabled:opacity-50 hover:opacity-90 font-semibold flex items-center gap-2"
            style={{ backgroundColor: '#0E6B54' }}>
            <CheckCircle2 size={15} />
            {saving ? 'Se salvează...' : 'Finalizează cererea'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Card ──────────────────────────────────────────────────────────────────
function TaskCard({ event, onToggle, onEdit }: {
  event: CalEvent;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const ti = typeInfo(event.type);
  const [expanded, setExpanded] = useState(false);

  const duration = (() => {
    if (event.all_day) return 'Toată ziua';
    if (!event.end_at) return null;
    const mins = Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60); const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  })();

  return (
    <div className={`flex gap-3 p-3 rounded-xl border bg-white shadow-sm transition-all ${event.completed ? 'opacity-55' : ''}`}>
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0 focus:outline-none" title={event.completed ? 'Marchează ca neefectuat' : 'Marchează ca finalizat'}>
        {event.completed
          ? <CheckCircle2 size={20} className="text-emerald-600" />
          : <Circle size={20} className="text-gray-300 hover:text-emerald-500 transition-colors" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold text-gray-900 leading-tight ${event.completed ? 'line-through text-gray-400' : ''}`}>
              {event.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${ti.light}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ti.dot}`} />
                {ti.label}
              </span>
              {!event.all_day && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock size={11} />{formatTime(event.start_at)}
                  {duration && <span className="text-gray-400">· {duration}</span>}
                </span>
              )}
              {event.all_day && (
                <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} />Toată ziua</span>
              )}
              {event.contact_name && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <User size={11} />{event.contact_name}
                </span>
              )}
              {event.contact_phone && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Phone size={11} />{event.contact_phone}
                </span>
              )}
            </div>
            {expanded && event.description && (
              <p className="text-xs text-gray-500 mt-2 italic leading-relaxed">{event.description}</p>
            )}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
            {event.description && (
              <button onClick={() => setExpanded(v => !v)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 text-xs">
              ✏️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TAB_FILTERS = [
  { key: 'all',      label: 'Toate' },
  { key: 'today',    label: 'Azi' },
  { key: 'upcoming', label: 'Viitoare' },
  { key: 'done',     label: 'Finalizate' },
] as const;

type Tab = typeof TAB_FILTERS[number]['key'];

export default function ActivitiesPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [error, setError] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CalEvent | null>(null);
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const [agentFilter, setAgentFilter] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) return;
      const d = await res.json();
      const list: { id: string; email: string; role: string }[] = d.agents || [];
      setAgents(list);
      const me = list.find(a => a.id === session.user.id);
      setIsOwner(me?.role === 'owner');
    })();
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 3, 1);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const agentParam = agentFilter ? `&agent_id=${agentFilter}` : '';
      const res = await fetch(`/api/calendar?from=${fmt(from)}&to=${fmt(to)}${agentParam}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare');
      setEvents(d.events || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la încărcare');
    } finally { setLoading(false); }
  }, [agentFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const saveEvent = async (data: Partial<CalEvent>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Neautentificat');
    const method = data.id ? 'PATCH' : 'POST';
    const res = await fetch('/api/calendar', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Eroare');
    await loadEvents();
  };

  const deleteEvent = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Neautentificat');
    await fetch(`/api/calendar?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await loadEvents();
  };

  const toggleComplete = async (e: CalEvent) => {
    if (!e.completed) {
      setCloseTarget(e);
      return;
    }
    await saveEvent({ id: e.id, completed: false });
  };

  const confirmCloseCerere = async (comment: string) => {
    if (!closeTarget) return;
    const existing = closeTarget.description?.trim();
    const fullDesc = existing ? `${existing}\n\n[Finalizare]: ${comment}` : `[Finalizare]: ${comment}`;
    await saveEvent({ id: closeTarget.id, completed: true, description: fullDesc });
    setCloseTarget(null);
  };

  const today = new Date();

  const filtered = events.filter(e => {
    const d = new Date(e.start_at);
    if (tab === 'today' && !sameDay(d, today)) return false;
    if (tab === 'upcoming' && (e.completed || (d < today && !sameDay(d, today)))) return false;
    if (tab === 'done' && !e.completed) return false;
    if (typeFilter && e.type !== typeFilter) return false;
    return true;
  });

  const groups = groupByDate(filtered);

  const counts = {
    all: events.length,
    today: events.filter(e => sameDay(new Date(e.start_at), today)).length,
    upcoming: events.filter(e => !e.completed && new Date(e.start_at) >= today).length,
    done: events.filter(e => !!e.completed).length,
  };

  return (
    <ProtectedLayout module="calendar">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4 pb-24">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Activități</h1>
            <p className="text-sm text-gray-500 mt-0.5">{counts.today} azi · {counts.upcoming} viitoare</p>
          </div>
          <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
            {isOwner && (
              <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-700 sm:flex-none">
                <option value="">Toți agenții</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            )}
            <button onClick={() => { setEditEvent(null); setShowModal(true); }}
              className="mobile-touch-target flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 sm:flex-none"
              style={{ backgroundColor: '#0E6B54' }}>
              <Plus size={16} /> Activitate nouă
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
            {error}
            {error.includes('permission') && (
              <p className="mt-1 text-xs text-red-600">
                Rulează SQL-ul de permisiuni în Supabase Dashboard → SQL Editor.
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TAB_FILTERS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-600'}`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTypeFilter('')}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${!typeFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={11} /> Toate tipurile
          </button>
          {EVENT_TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${typeFilter === t.value ? t.light + ' border-current' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Se încarcă...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">Nicio activitate</p>
            <p className="text-sm mt-1">Adaugă prima activitate cu butonul de sus.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    group.label === 'Azi'   ? 'text-emerald-700 bg-emerald-100' :
                    group.label === 'Mâine' ? 'text-blue-700 bg-blue-100' :
                    group.label === 'Ieri'  ? 'text-gray-500 bg-gray-100' :
                                              'text-gray-600 bg-gray-100'
                  }`}>{group.label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">
                    {group.items.length} activit{group.items.length === 1 ? 'ate' : 'ăți'}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.items.map(e => (
                    <TaskCard key={e.id} event={e}
                      onToggle={() => toggleComplete(e)}
                      onEdit={() => { setEditEvent(e); setShowModal(true); }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <EventModal
          event={editEvent}
          onClose={() => { setShowModal(false); setEditEvent(null); }}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}

      {closeTarget && (
        <CloseCommentModal
          event={closeTarget}
          onConfirm={confirmCloseCerere}
          onCancel={() => setCloseTarget(null)}
        />
      )}
    </ProtectedLayout>
  );
}
