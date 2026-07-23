'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  CheckSquare, Square, Plus, X, Loader2, Trash2, Calendar,
  AlertTriangle, Filter, Flag,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: 'mica' | 'medie' | 'mare';
  status: 'open' | 'done';
  due_at?: string | null;
  property_id?: string | null;
  lead_id?: string | null;
  assigned_to?: string | null;
  created_at: string;
}

const PRIORITY_META: Record<string, { label: string; cls: string; dot: string }> = {
  mare:  { label: 'Mare',  cls: 'bg-red-50 text-red-700 border-red-200',       dot: 'bg-red-500' },
  medie: { label: 'Medie', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  mica:  { label: 'Mică',  cls: 'bg-gray-50 text-gray-600 border-gray-200',    dot: 'bg-gray-400' },
};

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';

function isOverdue(t: Task) {
  return t.status === 'open' && t.due_at && new Date(t.due_at).getTime() < Date.now();
}

function fmtDue(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function AddTaskDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medie', due_at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Titlul este obligatoriu'); return; }
    try {
      setSaving(true); setError('');
      const t = (await supabase.auth.getSession()).data.session?.access_token;
      if (!t) throw new Error('Sesiune expirată');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, due_at: form.due_at ? new Date(form.due_at).toISOString() : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Task nou</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Titlu *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={ic} placeholder="ex: Sună proprietarul pentru documente" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Descriere</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className={ic} rows={2} placeholder="Detalii..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prioritate</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={ic}>
                <option value="mica">Mică</option>
                <option value="medie">Medie</option>
                <option value="mare">Mare</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Dată limită</label>
              <input type="datetime-local" value={form.due_at} onChange={e => set('due_at', e.target.value)} className={ic} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#0E6B54' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Se salvează...' : 'Adaugă task'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Anulare</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [filterPriority, setFilterPriority] = useState('');
  const [showDone, setShowDone] = useState(false);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const t = await token();
      if (!t) return;
      const res = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${t}` } });
      const d = await res.json();
      if (d.needsMigration) setNeedsMigration(true);
      setTasks(d.tasks || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleDone = async (task: Task) => {
    const t = await token();
    if (!t) return;
    const newStatus = task.status === 'done' ? 'open' : 'done';
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status: newStatus } : x));
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Ștergi acest task?')) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setTasks(prev => prev.filter(x => x.id !== id));
  };

  const visible = tasks.filter(t => {
    if (!showDone && t.status === 'done') return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  const openCount = tasks.filter(t => t.status === 'open').length;
  const overdueCount = tasks.filter(isOverdue).length;

  return (
    <ProtectedLayout module="tasks">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>Taskuri</h1>
            <p className="text-sm text-gray-500 mt-1">
              {openCount} de făcut
              {overdueCount > 0 && <span className="text-red-600 font-medium"> · {overdueCount} restante</span>}
            </p>
          </div>
          <button onClick={() => setIsAddOpen(true)}
            className="mobile-touch-target flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: '#0E6B54' }}>
            <Plus size={18} />Adaugă task
          </button>
        </div>

        {needsMigration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 mb-4">
            Tabela <code>tasks</code> nu există încă — rulează migrarea SQL în Supabase pentru a activa taskurile.
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-5 flex flex-wrap gap-3 items-center">
          <Filter size={15} className="text-gray-400" />
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">Toate prioritățile</option>
            <option value="mare">Mare</option>
            <option value="medie">Medie</option>
            <option value="mica">Mică</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} className="w-4 h-4 rounded accent-emerald-600" />
            Arată finalizate
          </label>
          <span className="text-xs text-gray-400 ml-auto">{visible.length} taskuri</span>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <CheckSquare size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Niciun task</p>
            <p className="text-sm text-gray-400 mt-1">Adaugă primul task cu butonul de mai sus</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(task => {
              const meta = PRIORITY_META[task.priority] || PRIORITY_META.medie;
              const overdue = isOverdue(task);
              return (
                <div key={task.id}
                  className={`bg-white rounded-xl border p-4 flex items-start gap-3 transition-all ${overdue ? 'border-red-200' : 'border-gray-200'}`}>
                  <button onClick={() => toggleDone(task)} className="mt-0.5 flex-shrink-0">
                    {task.status === 'done'
                      ? <CheckSquare size={20} className="text-emerald-600" />
                      : <Square size={20} className="text-gray-300 hover:text-emerald-500" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                        <Flag size={9} /> {meta.label}
                      </span>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                    {task.due_at && (
                      <p className={`flex items-center gap-1 text-xs mt-1 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {overdue ? <AlertTriangle size={11} /> : <Calendar size={11} />}
                        {fmtDue(task.due_at)}{overdue && ' · restant'}
                      </p>
                    )}
                  </div>
                  <button onClick={() => handleDelete(task.id)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isAddOpen && <AddTaskDialog onClose={() => setIsAddOpen(false)} onSuccess={() => { setIsAddOpen(false); fetchTasks(); }} />}
      </div>
    </ProtectedLayout>
  );
}
