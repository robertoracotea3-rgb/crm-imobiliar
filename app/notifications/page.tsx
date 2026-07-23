'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle, Bell, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3,
  EyeOff, Info, Loader2, RefreshCw, RotateCcw, X,
} from 'lucide-react';

interface Notification {
  id: string; type: string; title: string; message: string; priority: 'low' | 'normal' | 'high' | 'urgent';
  action_url?: string | null; read_at?: string | null; dismissed_at?: string | null; created_at: string;
}
interface Pagination { page: number; page_size: number; total: number; pages: number }
type InboxFilter = 'all' | 'unread' | 'urgent' | 'high' | 'dismissed';

const PRIORITY_STYLE = {
  urgent: { border: 'border-red-200', bg: 'bg-red-50', icon: <AlertTriangle size={17} className="text-red-600" />, label: 'Urgent' },
  high: { border: 'border-amber-200', bg: 'bg-amber-50', icon: <Clock3 size={17} className="text-amber-600" />, label: 'Prioritate mare' },
  normal: { border: 'border-blue-100', bg: 'bg-blue-50/50', icon: <Info size={17} className="text-blue-600" />, label: 'Normal' },
  low: { border: 'border-gray-200', bg: 'bg-gray-50', icon: <Info size={17} className="text-gray-500" />, label: 'Informativ' },
};

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'acum';
  if (minutes < 60) return `acum ${minutes} min`;
  if (minutes < 1_440) return `acum ${Math.floor(minutes / 60)} h`;
  return `acum ${Math.floor(minutes / 1_440)} zile`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, pages: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);

  const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token;
  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sesiunea a expirat.');
      const params = new URLSearchParams({ page: String(page), page_size: '25' });
      if (filter === 'unread') params.set('unread', '1');
      else if (filter === 'urgent' || filter === 'high') params.set('priority', filter);
      else if (filter === 'dismissed') params.set('dismissed', '1');
      const response = await fetch(`/api/notifications?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Notificările nu au putut fi încărcate.');
      setNotifications(data.notifications || []);
      setUnreadCount(Number(data.unread_count || 0));
      setPagination(data.pagination || { page, page_size: 25, total: 0, pages: 0 });
      setNeedsMigration(Boolean(data.needsMigration));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Eroare la încărcare.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- inbox is server-backed and filter dependent
  useEffect(() => { void load(1); }, [load]);

  const mutate = async (action: string, id?: string) => {
    const affected = id ? notifications.find((item) => item.id === id) : undefined;
    const token = await accessToken();
    if (!token) return false;
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Acțiunea nu a putut fi salvată.'); return false; }
    if (action === 'read_all') {
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, read_at: new Date().toISOString() })));
    } else if (id && data.notification) {
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, ...data.notification } : item));
      if (action === 'read') setUnreadCount((count) => Math.max(0, count - 1));
      if (action === 'unread') setUnreadCount((count) => count + 1);
      if (action === 'dismiss') {
        if (!affected?.read_at) setUnreadCount((count) => Math.max(0, count - 1));
        if (filter !== 'dismissed') setNotifications((current) => current.filter((item) => item.id !== id));
      }
      if (action === 'restore') {
        if (!affected?.read_at) setUnreadCount((count) => count + 1);
        if (filter === 'dismissed') setNotifications((current) => current.filter((item) => item.id !== id));
      }
    }
    window.dispatchEvent(new Event('crm:notifications-changed'));
    return true;
  };

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) await mutate('read', notification.id);
    if (notification.action_url) router.push(notification.action_url);
  };

  return (
    <ProtectedLayout module="notifications">
      <main className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center"><Bell size={21} className="text-emerald-700" /></div>
            <div><h1 className="text-2xl font-bold text-[#0E6B54]">Notificări</h1><p className="text-sm text-gray-500">{unreadCount} necitite · {pagination.total} în filtrul curent</p></div>
          </div>
          <div className="flex gap-2">
            <button disabled={!unreadCount} onClick={() => void mutate('read_all')} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm disabled:opacity-40"><CheckCheck size={15} /> Marchează toate citite</button>
            <button onClick={() => void load(pagination.page)} disabled={loading} className="p-2 border rounded-lg text-gray-600 disabled:opacity-40" title="Reîmprospătează">{loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}</button>
          </div>
        </div>

        {needsMigration && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">Este necesară migrația notificărilor persistente.</div>}
        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2"><AlertTriangle size={16} />{error}<button onClick={() => setError('')} className="ml-auto"><X size={15} /></button></div>}

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {([
            ['all','Toate'],['unread','Necitite'],['urgent','Urgente'],['high','Prioritate mare'],['dismissed','Arhivate'],
          ] as Array<[InboxFilter,string]>).map(([value,label]) => (
            <button key={value} onClick={() => setFilter(value)} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${filter === value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200"><Check size={34} className="mx-auto text-emerald-400 mb-3" /><p className="font-semibold text-gray-700">Nu există notificări în acest filtru.</p></div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const style = PRIORITY_STYLE[notification.priority] || PRIORITY_STYLE.normal;
              return (
                <article key={notification.id} className={`rounded-xl border p-4 ${style.border} ${notification.read_at ? 'bg-white opacity-75' : style.bg}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{style.icon}</div>
                    <button onClick={() => void openNotification(notification)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><strong className="text-sm text-gray-900">{notification.title}</strong><span className="text-[10px] uppercase tracking-wide text-gray-500">{style.label}</span>{!notification.read_at && <span className="w-2 h-2 rounded-full bg-emerald-500" aria-label="Necitită" />}</div>
                      <p className="text-sm text-gray-700 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">{relativeTime(notification.created_at)}</p>
                    </button>
                    <div className="flex items-center gap-1">
                      {filter === 'dismissed' ? (
                        <button onClick={() => void mutate('restore', notification.id)} className="p-2 text-gray-500 hover:text-emerald-700" title="Restaurează"><RotateCcw size={15} /></button>
                      ) : (
                        <button onClick={() => void mutate('dismiss', notification.id)} className="p-2 text-gray-500 hover:text-red-600" title="Arhivează"><EyeOff size={15} /></button>
                      )}
                      <button onClick={() => void mutate(notification.read_at ? 'unread' : 'read', notification.id)} className="p-2 text-gray-500 hover:text-emerald-700" title={notification.read_at ? 'Marchează necitită' : 'Marchează citită'}>{notification.read_at ? <Bell size={15} /> : <Check size={15} />}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-5 text-sm text-gray-600">
          <span>Pagina {pagination.page} din {Math.max(1, pagination.pages)}</span>
          <div className="flex gap-2">
            <button disabled={loading || pagination.page <= 1} onClick={() => void load(pagination.page - 1)} className="p-2 border rounded-lg disabled:opacity-40"><ChevronLeft size={17} /></button>
            <button disabled={loading || pagination.page >= pagination.pages} onClick={() => void load(pagination.page + 1)} className="p-2 border rounded-lg disabled:opacity-40"><ChevronRight size={17} /></button>
          </div>
        </div>
      </main>
    </ProtectedLayout>
  );
}
