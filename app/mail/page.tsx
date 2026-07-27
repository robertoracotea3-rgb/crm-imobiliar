'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  PenLine,
  RefreshCw,
  Reply,
  Search,
  Send,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { supabase } from '@/lib/supabase';

type Folder = 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';
type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  user_id: string;
};
type MessageSummary = {
  id: string;
  direction: 'inbound' | 'outbound';
  folder: Folder;
  from_email: string;
  from_name?: string | null;
  to_emails: string[];
  reply_to_email?: string | null;
  subject: string;
  snippet: string;
  status: string;
  read_at?: string | null;
  received_at?: string | null;
  sent_at?: string | null;
  created_at: string;
  contact_id?: string | null;
  lead_id?: string | null;
  property_id?: string | null;
};
type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
};
type MessageDetail = MessageSummary & {
  cc_emails?: string[];
  reply_to_email?: string | null;
  text_body: string;
  attachments?: Attachment[];
};
type Pagination = { page: number; page_size: number; total: number; pages: number };

const folderOptions: Array<{ value: Folder; label: string; icon: typeof Inbox }> = [
  { value: 'inbox', label: 'Primite', icon: Inbox },
  { value: 'sent', label: 'Trimise', icon: SendHorizontal },
  { value: 'archive', label: 'Arhivă', icon: Archive },
  { value: 'trash', label: 'Coș', icon: Trash2 },
];

function relativeDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'acum';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date);
}

function fullDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function deliveryStatus(status: string): { label: string; className: string } | null {
  if (status === 'delivered') return { label: 'Livrat', className: 'bg-emerald-50 text-emerald-700' };
  if (status === 'bounced') return { label: 'Respins de destinatar', className: 'bg-red-50 text-red-700' };
  if (status === 'failed') return { label: 'Trimitere eșuată', className: 'bg-red-50 text-red-700' };
  if (status === 'accepted' || status === 'queued') {
    return { label: 'Acceptat pentru livrare', className: 'bg-amber-50 text-amber-700' };
  }
  return null;
}

async function accessToken(): Promise<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sesiunea a expirat.');
  return token;
}

export default function MailPage() {
  const [folder, setFolder] = useState<Folder>('inbox');
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState('');
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 30, total: 0, pages: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: '', cc: '', subject: '', text: '', reply_message_id: '' });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadMessages = useCallback(async (
    nextPage = 1,
    nextMailboxId: string | undefined = selectedMailboxId || undefined,
    nextFolder: Folder = folder,
    search = appliedQuery,
  ) => {
    setLoading(true);
    setError('');
    try {
      const token = await accessToken();
      const params = new URLSearchParams({
        folder: nextFolder,
        page: String(nextPage),
        page_size: '30',
      });
      if (nextMailboxId) params.set('mailbox_id', nextMailboxId);
      if (search) params.set('q', search);
      const response = await fetch(`/api/mail?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (response.status === 409 && data.next_path) {
        window.location.assign(data.next_path);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Inboxul nu a putut fi încărcat.');
      setMailbox(data.mailbox);
      setMailboxes(data.mailboxes || []);
      setMessages(data.messages || []);
      setUnreadCount(Number(data.unread_count || 0));
      setPagination(data.pagination || { page: nextPage, page_size: 30, total: 0, pages: 0 });
      window.dispatchEvent(new Event('crm:mail-changed'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inboxul nu a putut fi încărcat.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, folder, selectedMailboxId]);

  const mutateMessage = async (id: string, action: string, reload = true) => {
    const token = await accessToken();
    const response = await fetch(`/api/mail/messages/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Mesajul nu a putut fi actualizat.');
    setMessages(current => current.map(item => item.id === id ? { ...item, ...data.message } : item));
    if (selected?.id === id) setSelected(current => current ? { ...current, ...data.message } : current);
    if (action === 'read') setUnreadCount(current => Math.max(0, current - 1));
    if (action === 'unread') setUnreadCount(current => current + 1);
    window.dispatchEvent(new Event('crm:mail-changed'));
    if (reload && ['archive', 'restore', 'trash'].includes(action)) {
      setSelected(null);
      setRefreshVersion(current => current + 1);
    }
  };

  const runMessageAction = async (id: string, action: string, reload = true) => {
    setError('');
    setNotice('');
    try {
      await mutateMessage(id, action, reload);
      if (action === 'trash') setNotice('Mesajul a fost mutat în Coș.');
      if (action === 'restore') setNotice('Mesajul a fost restaurat.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mesajul nu a putut fi actualizat.');
    }
  };

  const openMessage = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const token = await accessToken();
      const response = await fetch(`/api/mail/messages/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Mesajul nu a putut fi deschis.');
      setSelected(data.message);
      if (!data.message.read_at && data.message.direction === 'inbound') {
        await mutateMessage(id, 'read', false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mesajul nu a putut fi deschis.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMessages(1), 0);
    return () => window.clearTimeout(timer);
  }, [loadMessages, refreshVersion]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('message');
    if (!requested) return;
    const timer = window.setTimeout(() => void openMessage(requested), 0);
    return () => window.clearTimeout(timer);
    // Only inspect the initial notification deep-link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCompose = (message?: MessageSummary | MessageDetail) => {
    if (message) {
      const recipient = message.direction === 'inbound'
        ? message.reply_to_email || message.from_email
        : message.to_emails?.[0] || '';
      const subject = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
      setCompose({ to: recipient, cc: '', subject, text: '', reply_message_id: message.id });
    } else {
      setCompose({ to: '', cc: '', subject: '', text: '', reply_message_id: '' });
    }
    setComposeOpen(true);
    setNotice('');
    setError('');
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(compose),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Mesajul nu a putut fi trimis.');
      setNotice('Mesajul a fost acceptat pentru livrare.');
      setComposeOpen(false);
      setFolder('sent');
      setQuery('');
      setAppliedQuery('');
      setSelected(null);
      setRefreshVersion(current => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mesajul nu a putut fi trimis.');
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async (messageId: string, attachment: Attachment) => {
    try {
      const token = await accessToken();
      const response = await fetch(`/api/mail/messages/${messageId}/attachments/${attachment.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Atașamentul nu poate fi descărcat.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Atașamentul nu poate fi descărcat.');
    }
  };

  const activeFolder = useMemo(
    () => folderOptions.find(option => option.value === folder) || folderOptions[0],
    [folder],
  );

  return (
    <ProtectedLayout module="mail">
      <main className="min-h-[calc(100dvh-4.5rem)] bg-stone-50 md:min-h-screen">
        <div className="border-b border-gray-200 bg-white px-4 py-4 md:px-6">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Mail size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">E-mail</h1>
                <p className="text-sm text-gray-500">{mailbox?.address || 'Căsuța personală Kira'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startCompose()}
              className="mobile-touch-target inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <PenLine size={18} />
              Mesaj nou
            </button>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1500px] md:grid-cols-[220px_minmax(320px,430px)_1fr]">
          <aside className="border-b border-gray-200 bg-white p-3 md:min-h-[calc(100vh-81px)] md:border-b-0 md:border-r">
            {mailboxes.length > 1 && (
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Inbox agent</span>
                <select
                  value={selectedMailboxId || mailbox?.id || ''}
                  onChange={event => {
                    setSelected(null);
                    setSelectedMailboxId(event.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800"
                >
                  {mailboxes.map(item => <option key={item.id} value={item.id}>{item.display_name} · {item.address}</option>)}
                </select>
              </label>
            )}
            <nav className="flex gap-2 overflow-x-auto md:block md:space-y-1" aria-label="Dosare e-mail">
              {folderOptions.map(option => {
                const Icon = option.icon;
                const active = option.value === folder;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFolder(option.value);
                      setSelected(null);
                    }}
                    className={`mobile-touch-target flex min-w-max items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium md:w-full ${
                      active ? 'bg-emerald-50 text-emerald-800' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} />
                    {option.label}
                    {option.value === 'inbox' && unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className={`${selected ? 'hidden md:block' : 'block'} border-r border-gray-200 bg-white`}>
            <div className="border-b border-gray-200 p-3">
              <form
                onSubmit={event => {
                  event.preventDefault();
                  setAppliedQuery(query.trim());
                }}
                className="flex gap-2"
              >
                <label className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm text-gray-900"
                    placeholder="Caută în mesaje"
                    aria-label="Caută în mesaje"
                  />
                </label>
                <button type="submit" className="rounded-lg border border-gray-300 px-3 text-gray-600" title="Caută">
                  <Search size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setRefreshVersion(current => current + 1)}
                  className="rounded-lg border border-gray-300 px-3 text-gray-600"
                  title="Reîmprospătează"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
              </form>
            </div>

            {error && (
              <div className="m-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            {notice && (
              <div className="m-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <Check size={17} /> {notice}
              </div>
            )}

            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
              </div>
            ) : messages.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <MailOpen className="mx-auto text-gray-300" size={42} />
                <p className="mt-3 font-semibold text-gray-700">Nu există mesaje în {activeFolder.label.toLowerCase()}.</p>
                <p className="mt-1 text-sm text-gray-500">Mesajele noi vor apărea automat aici.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`transition hover:bg-gray-50 ${
                      selected?.id === message.id ? 'bg-emerald-50' : ''
                    } ${!message.read_at && message.direction === 'inbound' ? 'bg-blue-50/40' : ''}`}
                  >
                    <a
                      href={`/mail?message=${encodeURIComponent(message.id)}`}
                      className="block w-full p-4 pb-2 text-left"
                      aria-label={`Deschide mesajul ${message.subject}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                          !message.read_at && message.direction === 'inbound' ? 'bg-emerald-500' : 'bg-transparent'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <strong className={`truncate text-sm ${!message.read_at ? 'text-gray-950' : 'text-gray-700'}`}>
                              {message.direction === 'outbound'
                                ? `Către: ${message.to_emails?.join(', ')}`
                                : message.from_name || message.from_email}
                            </strong>
                            <span className="shrink-0 text-xs text-gray-400">
                              {relativeDate(message.received_at || message.sent_at || message.created_at)}
                            </span>
                          </div>
                          <p className={`mt-1 truncate text-sm ${!message.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {message.subject}
                          </p>
                          {message.direction === 'outbound' && deliveryStatus(message.status) && (
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${deliveryStatus(message.status)?.className}`}>
                              {deliveryStatus(message.status)?.label}
                            </span>
                          )}
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{message.snippet}</p>
                        </div>
                      </div>
                    </a>
                    <div className="flex items-center justify-end gap-1 px-4 pb-3">
                      <button
                        type="button"
                        onClick={() => startCompose(message)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        aria-label={`Răspunde la mesajul ${message.subject}`}
                      >
                        <Reply size={15} /> Răspunde
                      </button>
                      <button
                        type="button"
                        onClick={() => void runMessageAction(
                          message.id,
                          message.folder === 'trash' ? 'restore' : 'trash',
                        )}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-700"
                        aria-label={message.folder === 'trash' ? 'Restaurează mesajul' : 'Mută mesajul în Coș'}
                      >
                        <Trash2 size={15} />
                        {message.folder === 'trash' ? 'Restaurează' : 'Coș'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 p-3 text-xs text-gray-500">
              <span>{pagination.total} mesaje</span>
              <div className="flex gap-2">
                <button
                  disabled={loading || pagination.page <= 1}
                  onClick={() => void loadMessages(pagination.page - 1)}
                  className="rounded-lg border p-2 disabled:opacity-35"
                ><ChevronLeft size={16} /></button>
                <button
                  disabled={loading || pagination.page >= pagination.pages}
                  onClick={() => void loadMessages(pagination.page + 1)}
                  className="rounded-lg border p-2 disabled:opacity-35"
                ><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>

          <section className={`${selected ? 'block' : 'hidden md:flex'} min-h-[60vh] bg-white md:min-h-[calc(100vh-81px)]`}>
            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>
            ) : selected ? (
              <article className="w-full">
                <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="mobile-touch-target rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
                    aria-label="Înapoi la mesaje"
                  ><ArrowLeft size={20} /></button>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void runMessageAction(selected.id, selected.read_at ? 'unread' : 'read')}
                      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                      title={selected.read_at ? 'Marchează necitit' : 'Marchează citit'}
                    >{selected.read_at ? <Mail size={18} /> : <MailOpen size={18} />}</button>
                    <button
                      type="button"
                      onClick={() => void runMessageAction(selected.id, selected.folder === 'archive' ? 'restore' : 'archive')}
                      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                      title={selected.folder === 'archive' ? 'Restaurează' : 'Arhivează'}
                    ><Archive size={18} /></button>
                    <button
                      type="button"
                      onClick={() => void runMessageAction(
                        selected.id,
                        selected.folder === 'trash' ? 'restore' : 'trash',
                      )}
                      className="rounded-lg p-2 text-gray-600 hover:bg-red-50 hover:text-red-600"
                      title={selected.folder === 'trash' ? 'Restaurează' : 'Mută în coș'}
                    ><Trash2 size={18} /></button>
                  </div>
                </div>
                {error && (
                  <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    {error}
                  </div>
                )}

                <div className="p-5 sm:p-7">
                  <h2 className="text-xl font-bold text-gray-950">{selected.subject}</h2>
                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {selected.direction === 'outbound' ? mailbox?.display_name : selected.from_name || selected.from_email}
                      </p>
                      <p className="mt-0.5 break-all text-sm text-gray-500">
                        {selected.direction === 'outbound'
                          ? `Către: ${selected.to_emails?.join(', ')}`
                          : `${selected.from_email} → ${mailbox?.address}`}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-gray-400">
                      {fullDate(selected.received_at || selected.sent_at || selected.created_at)}
                    </time>
                  </div>

                  {(selected.contact_id || selected.lead_id || selected.property_id) && (
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {selected.contact_id && (
                        <Link href={`/clients/${selected.contact_id}`} className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 hover:underline">
                          Deschide contactul CRM
                        </Link>
                      )}
                      {selected.lead_id && (
                        <Link href={`/clients?lead_id=${selected.lead_id}`} className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700 hover:underline">
                          Deschide leadul
                        </Link>
                      )}
                      {selected.property_id && (
                        <Link href={`/properties/${selected.property_id}`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 hover:underline">
                          Deschide proprietatea
                        </Link>
                      )}
                    </div>
                  )}

                  {selected.direction === 'outbound' && deliveryStatus(selected.status) && (
                    <div className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${deliveryStatus(selected.status)?.className}`}>
                      {deliveryStatus(selected.status)?.label}
                    </div>
                  )}

                  <div className="mt-7 whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-800">
                    {selected.text_body || '(Mesaj fără conținut text)'}
                  </div>

                  {selected.attachments && selected.attachments.length > 0 && (
                    <div className="mt-7 border-t border-gray-100 pt-5">
                      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <Paperclip size={17} /> Atașamente
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.attachments.map(attachment => (
                          <button
                            key={attachment.id}
                            type="button"
                            disabled={attachment.status !== 'available'}
                            onClick={() => void downloadAttachment(selected.id, attachment)}
                            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 disabled:opacity-45"
                          >
                            <Download size={16} />
                            <span><strong className="block max-w-52 truncate">{attachment.filename}</strong><small>{formatBytes(attachment.size_bytes)}</small></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => startCompose(selected)}
                    className="mt-8 inline-flex items-center gap-2 rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
                    <Reply size={18} /> Răspunde
                  </button>
                </div>
              </article>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <MailOpen className="mx-auto text-gray-200" size={58} />
                  <p className="mt-4 font-semibold text-gray-600">Selectează un mesaj pentru a-l citi.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {composeOpen && (
          <div className="mobile-dialog-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
            <section className="mobile-dialog-panel w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">{compose.reply_message_id ? 'Răspunde' : 'Mesaj nou'}</h2>
                  <p className="text-xs text-gray-500">De la {mailbox?.address}</p>
                </div>
                <button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Închide">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={sendMessage} className="space-y-4 p-5">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    {error}
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Către</span>
                  <input
                    type="text"
                    value={compose.to}
                    onChange={event => setCompose(current => ({ ...current, to: event.target.value }))}
                    placeholder="client@exemplu.ro"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">CC (opțional)</span>
                  <input
                    type="text"
                    value={compose.cc}
                    onChange={event => setCompose(current => ({ ...current, cc: event.target.value }))}
                    placeholder="Separă adresele cu virgulă"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Subiect</span>
                  <input
                    value={compose.subject}
                    onChange={event => setCompose(current => ({ ...current, subject: event.target.value }))}
                    maxLength={998}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Mesaj</span>
                  <textarea
                    value={compose.text}
                    onChange={event => setCompose(current => ({ ...current, text: event.target.value }))}
                    rows={10}
                    className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900"
                    required
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700">
                    Renunță
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                    Trimite
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </ProtectedLayout>
  );
}
