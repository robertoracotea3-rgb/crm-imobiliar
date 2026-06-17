'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import Link from 'next/link';
import {
  Bell, AlertTriangle, CheckCircle, Info, MessageSquare,
  Home, Search, RefreshCw, ChevronRight,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  severity: string;
  message: string;
  link?: string;
  created_at: string;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'acum';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}z`;
}

const SEVERITY_STYLES: Record<string, { bg: string; icon: React.ReactNode; border: string }> = {
  alert: { bg: 'bg-red-50', border: 'border-red-200', icon: <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" /> },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" /> },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" /> },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" /> },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  lead: <MessageSquare size={14} className="text-purple-500" />,
  property: <Home size={14} className="text-emerald-600" />,
  demand: <Search size={14} className="text-blue-500" />,
  success: <CheckCircle size={14} className="text-emerald-600" />,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'alert' | 'warning' | 'info' | 'success'>('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sesiune expirată'); return; }
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNotifications(d.notifications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.severity === filter);

  const counts = {
    all: notifications.length,
    alert: notifications.filter(n => n.severity === 'alert').length,
    warning: notifications.filter(n => n.severity === 'warning').length,
    info: notifications.filter(n => n.severity === 'info').length,
    success: notifications.filter(n => n.severity === 'success').length,
  };

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Bell size={20} className="text-emerald-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Notificări</h1>
              <p className="text-sm text-gray-500">{counts.all} notificări active</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Reîmprospătează
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {([
            { key: 'all', label: 'Toate', color: 'text-gray-700' },
            { key: 'alert', label: 'Urgente', color: 'text-red-600' },
            { key: 'warning', label: 'Atenție', color: 'text-amber-600' },
            { key: 'info', label: 'Info', color: 'text-blue-600' },
            { key: 'success', label: 'Succes', color: 'text-emerald-600' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                ${filter === tab.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filter === tab.key ? 'bg-white/20 text-white' : tab.color + ' bg-gray-100'}`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <p className="text-red-800">{error}</p>
            <button onClick={load} className="ml-auto text-sm underline text-red-600">Reîncearcă</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <p className="text-gray-700 font-semibold">Totul e în ordine!</p>
            <p className="text-sm text-gray-400 mt-1">Nu ai notificări în categoria selectată</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
              const content = (
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${style.bg} ${style.border} ${n.link ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}>
                  {style.icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {TYPE_ICON[n.type]}
                      <span className="text-xs text-gray-400">{relativeTime(n.created_at)} în urmă</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 leading-snug">{n.message}</p>
                  </div>
                  {n.link && <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link}>{content}</Link>
              ) : (
                <div key={n.id}>{content}</div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        {!loading && !error && (
          <p className="text-center text-xs text-gray-300 mt-8">
            Notificările sunt generate dinamic din datele CRM · <button onClick={load} className="text-emerald-400 hover:text-emerald-600">Reîmprospătează</button>
          </p>
        )}
      </div>
    </ProtectedLayout>
  );
}
