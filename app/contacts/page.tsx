'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Phone, Mail, Search, X, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SetupAlert } from '@/components/SetupAlert';

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

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', phone2: '', email: '', cnp: '', address: '', type: 'proprietar', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');

  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/contacts', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const d = await res.json();
      setContacts(d.contacts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      setSaving(true); setErr(''); setWarn('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setContacts(p => [...p, d.contact].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAdd(false);
      setForm({ name: '', phone: '', phone2: '', email: '', cnp: '', address: '', type: 'proprietar', notes: '' });
      if (d.warning) setWarn(d.warning);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={26} style={{ color: '#0E6B54' }} />
          <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Contacte</h1>
          <span className="bg-gray-100 text-gray-600 text-sm px-2.5 py-0.5 rounded-full font-medium">{contacts.length}</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
          style={{ backgroundColor: '#0E6B54' }}>
          <Plus size={18} /> Adaugă contact
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">Contact nou</h3>
            <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>
          {err && (
            <div className="mb-3">
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-sm">{err}</div>
              <SetupAlert message={err} />
            </div>
          )}
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nume *</label>
                <input type="text" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="Ion Popescu" required className={ic} />
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
                <input type="tel" value={form.phone} onChange={e => sf('phone', e.target.value)} placeholder="07xx xxx xxx" className={ic} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Telefon 2</label>
                <input type="tel" value={form.phone2} onChange={e => sf('phone2', e.target.value)} placeholder="07xx xxx xxx" className={ic} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => sf('email', e.target.value)} placeholder="email@example.com" className={ic} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CNP / CUI</label>
                <input type="text" value={form.cnp} onChange={e => sf('cnp', e.target.value)} placeholder="CNP sau CUI" className={ic} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Adresă</label>
              <input type="text" value={form.address} onChange={e => sf('address', e.target.value)} placeholder="Adresa completa" className={ic} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
              <input type="text" value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Observatii..." className={ic} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: '#0E6B54' }}>
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Anulare
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Warning banner when schema fallback was used */}
      {warn && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-xs text-amber-800">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{warn}{' '}<Link href="/setup" className="underline font-semibold">→ Setup DB</Link></span>
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
        <div className="text-center text-gray-500 py-12">Se încarcă...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">{search ? 'Niciun contact găsit' : 'Nu ai contacte încă'}</p>
          <p className="text-sm text-gray-400 mt-1">{search ? 'Încearcă altă căutare' : 'Adaugă primul contact cu butonul de mai sus'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
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
                <div className="flex items-center gap-4">
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
              <div className="text-xs text-gray-400 flex-shrink-0">
                {new Date(c.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
