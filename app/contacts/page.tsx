'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Phone, Mail, Search, X, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  phone2?: string;
  email?: string;
  cnp?: string;
  address?: string;
  type?: string;
  notes?: string;
  agent_id?: string;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  proprietar: 'Proprietar', cumparator: 'Cumpărător',
  chirias: 'Chiriaș', dezvoltator: 'Dezvoltator',
};
const TYPE_COLOR: Record<string, string> = {
  proprietar: 'bg-blue-100 text-blue-700',
  cumparator: 'bg-green-100 text-green-700',
  chirias: 'bg-purple-100 text-purple-700',
  dezvoltator: 'bg-orange-100 text-orange-700',
};

const EMPTY_FORM = { name: '', phone: '', phone2: '', email: '', cnp: '', address: '', type: 'proprietar', notes: '', agent_id: '' };
const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoadError('Sesiune expirată'); return; }
      const res = await fetch('/api/contacts', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (signal?.aborted) return;
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setContacts(d.contacts || []);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setLoadError('Nu am putut încărca contactele');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => setAgents(d.agents || []));
    });
  }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setFormErr(''); setShowForm(true); };
  const openEdit = (c: Contact) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone || '', phone2: c.phone2 || '', email: c.email || '', cnp: c.cnp || '', address: c.address || '', type: c.type || 'proprietar', notes: c.notes || '', agent_id: c.agent_id || '' });
    setFormErr('');
    setShowForm(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true); setFormErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');

      const method = editingId ? 'PATCH' : 'POST';
      const body = editingId ? { ...form, id: editingId } : form;
      const res = await fetch('/api/contacts', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      if (editingId) {
        setContacts(prev => prev.map(c => c.id === editingId ? d.contact : c).sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setContacts(prev => [...prev, d.contact].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    setDeletingId(contact.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/contacts?id=${contact.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setContacts(prev => prev.filter(c => c.id !== contact.id));
      setDeleteConfirm(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Eroare la ștergere');
    } finally {
      setDeletingId(null);
    }
  };

  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users size={26} style={{ color: '#0E6B54' }} />
            <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Contacte</h1>
            <span className="bg-gray-100 text-gray-600 text-sm px-2.5 py-0.5 rounded-full font-medium">{contacts.length}</span>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
            style={{ backgroundColor: '#0E6B54' }}>
            <Plus size={18} /> Adaugă contact
          </button>
        </div>

        {/* Form panel */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">{editingId ? 'Editează contact' : 'Contact nou'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            {formErr && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded p-2 text-red-700 text-sm">{formErr}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nume *</label>
                  <input type="text" value={form.name} onChange={e => sf('name', e.target.value)} required className={ic} placeholder="Ion Popescu" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tip</label>
                  <select value={form.type} onChange={e => sf('type', e.target.value)} className={ic + ' bg-white'}>
                    <option value="proprietar">Proprietar</option>
                    <option value="cumparator">Cumpărător</option>
                    <option value="chirias">Chiriaș</option>
                    <option value="dezvoltator">Dezvoltator</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
                  <input type="tel" value={form.phone} onChange={e => sf('phone', e.target.value)} className={ic} placeholder="07xx xxx xxx" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefon 2</label>
                  <input type="tel" value={form.phone2} onChange={e => sf('phone2', e.target.value)} className={ic} placeholder="07xx xxx xxx" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => sf('email', e.target.value)} className={ic} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CNP / CUI</label>
                  <input type="text" value={form.cnp} onChange={e => sf('cnp', e.target.value)} className={ic} placeholder="CNP sau CUI" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Adresă</label>
                <input type="text" value={form.address} onChange={e => sf('address', e.target.value)} className={ic} placeholder="Adresa completă" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                <input type="text" value={form.notes} onChange={e => sf('notes', e.target.value)} className={ic} placeholder="Observații..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Agent responsabil</label>
                <select value={form.agent_id} onChange={e => sf('agent_id', e.target.value)} className={ic + ' bg-white'}>
                  <option value="">— Neasignat —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: '#0E6B54' }}>
                  {saving ? 'Se salvează...' : editingId ? 'Actualizează' : 'Salvează'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Anulare
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Delete confirm */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={22} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Șterge contact</p>
                  <p className="text-sm text-gray-600 mt-1">Ești sigur că vrei să ștergi <strong>{deleteConfirm.name}</strong>? Această acțiune nu poate fi anulată.</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Anulare</button>
                <button onClick={() => handleDelete(deleteConfirm)} disabled={!!deletingId}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                  {deletingId ? 'Se șterge...' : 'Șterge'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Caută după nume, telefon sau email..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"><X size={16} /></button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="text-red-700 text-sm">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{search ? 'Niciun contact găsit' : 'Nu ai contacte încă'}</p>
            <p className="text-sm text-gray-400 mt-1">{search ? 'Încearcă altă căutare' : 'Adaugă primul contact cu butonul de mai sus'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: '#0E6B54' }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[c.type] || 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[c.type] || c.type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                        className="text-sm text-gray-500 flex items-center gap-1 hover:text-emerald-600 transition-colors">
                        <Phone size={12} />{c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                        className="text-sm text-gray-500 flex items-center gap-1 hover:text-emerald-600 transition-colors">
                        <Mail size={12} />{c.email}
                      </a>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{c.notes}</p>}
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                  {new Date(c.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)}
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Editează">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteConfirm(c)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Șterge">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
