'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  MailCheck,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type EmailSettings = {
  agency_id: string;
  documents_email: string;
  reports_email: string;
  reply_to_email: string;
  sender_name: string;
  provider: string;
  provider_domain_status: 'unconfirmed' | 'pending' | 'verified' | 'failed';
  provider_domain_verified_at: string | null;
  mailbox_status: 'unconfirmed' | 'accepted' | 'verified' | 'failed';
  mailbox_verified_at: string | null;
  documents_verified_at: string | null;
  reports_verified_at: string | null;
  reply_to_verified_at: string | null;
  last_test_recipient: string | null;
  last_test_status: 'accepted' | 'failed' | null;
  last_test_provider_id: string | null;
  last_test_accepted_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
};

type DeliveryLog = {
  id: string;
  message_type: string;
  recipient_email: string;
  subject: string;
  provider_message_id: string | null;
  status: string;
  attempt_number: number;
  error_code: string | null;
  error_message: string | null;
  accepted_at: string | null;
  failed_at: string | null;
  created_at: string;
};

type ApiData = {
  settings: EmailSettings;
  recent_logs: DeliveryLog[];
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-100';

function dateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(value));
}

function StatusBadge({ verified, pendingLabel }: { verified: boolean; pendingLabel: string }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <CheckCircle2 size={14} /> Verificat
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
      <Clock3 size={14} /> {pendingLabel}
    </span>
  );
}

export function EmailSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    documents_email: 'documente@kiraimobiliare.ro',
    reports_email: 'rapoarte@kiraimobiliare.ro',
    reply_to_email: 'contact@kiraimobiliare.ro',
    sender_name: 'Kira Imobiliare',
  });
  const [testRecipient, setTestRecipient] = useState('documente@kiraimobiliare.ro');

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) throw new Error('Sesiunea a expirat. Autentifică-te din nou.');
    return fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/settings/email');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Setările de e-mail nu au putut fi încărcate.');
      const next = payload as ApiData;
      setData(next);
      setForm({
        documents_email: next.settings.documents_email,
        reports_email: next.settings.reports_email,
        reply_to_email: next.settings.reply_to_email,
        sender_name: next.settings.sender_name,
      });
      setTestRecipient(next.settings.last_test_recipient || next.settings.documents_email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setările de e-mail nu au putut fi încărcate.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const message = await action();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operațiunea nu a putut fi finalizată.');
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', async () => {
    const response = await authFetch('/api/settings/email', {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Configurația nu a putut fi salvată.');
    return 'Configurația a fost salvată. Adresele modificate trebuie reverificate.';
  });

  const postAction = (key: string, body: Record<string, string>, success: string) =>
    run(key, async () => {
      const response = await authFetch('/api/settings/email', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.errorMessage || 'Operațiunea a eșuat.');
      return success;
    });

  const recipients = useMemo(() => data ? [
    data.settings.documents_email,
    data.settings.reports_email,
    data.settings.reply_to_email,
  ].filter((value, index, values) => values.indexOf(value) === index) : [], [data]);

  if (loading && !data) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-gray-200 bg-white">
        <Loader2 className="animate-spin text-emerald-700" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Configurația nu este disponibilă.'}
      </div>
    );
  }

  const settings = data.settings;
  const canConfirm = settings.last_test_status === 'accepted'
    && settings.last_test_recipient === testRecipient;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            CRM-ul separă verificarea domeniului de confirmarea căsuței poștale.
            Acceptarea mesajului de către furnizor nu înseamnă că mesajul a ajuns în inbox.
          </p>
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 shrink-0" size={17} /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 shrink-0" size={17} /> {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Domeniu expeditor</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <strong className="text-sm text-gray-900">kiraimobiliare.ro</strong>
            <StatusBadge
              verified={settings.provider_domain_status === 'verified'}
              pendingLabel={settings.provider_domain_status === 'failed' ? 'Verificare eșuată' : 'Neconfirmat'}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Ultima verificare: {dateTime(settings.provider_domain_verified_at)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Căsuțe poștale</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <strong className="text-sm text-gray-900">Documente și rapoarte</strong>
            <StatusBadge
              verified={settings.mailbox_status === 'verified'}
              pendingLabel={settings.mailbox_status === 'accepted' ? 'Test acceptat, neconfirmat' : 'Neconfirmat'}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Confirmare completă: {dateTime(settings.mailbox_verified_at)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <MailCheck size={19} className="text-emerald-700" />
          <h2 className="font-semibold text-gray-900">Adrese oficiale</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-gray-700">
            Adresă documente
            <input
              className={`${inputClass} mt-1`}
              value={form.documents_email}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, documents_email: event.target.value }))}
            />
            <span className="mt-1 block text-xs text-gray-500">
              {settings.documents_verified_at ? `Confirmată: ${dateTime(settings.documents_verified_at)}` : 'Neconfirmată'}
            </span>
          </label>
          <label className="text-sm text-gray-700">
            Adresă rapoarte
            <input
              className={`${inputClass} mt-1`}
              value={form.reports_email}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, reports_email: event.target.value }))}
            />
            <span className="mt-1 block text-xs text-gray-500">
              {settings.reports_verified_at ? `Confirmată: ${dateTime(settings.reports_verified_at)}` : 'Neconfirmată'}
            </span>
          </label>
          <label className="text-sm text-gray-700">
            Adresă de răspuns
            <input
              className={`${inputClass} mt-1`}
              value={form.reply_to_email}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, reply_to_email: event.target.value }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Nume expeditor
            <input
              className={`${inputClass} mt-1`}
              value={form.sender_name}
              disabled={!canEdit}
              onChange={(event) => setForm((current) => ({ ...current, sender_name: event.target.value }))}
            />
          </label>
        </div>
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvează
            </button>
            <button
              type="button"
              onClick={() => void postAction(
                'verify-domain',
                { action: 'verify_domain' },
                'Verificarea domeniului a fost actualizată.',
              )}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              {busy === 'verify-domain' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Verifică domeniul
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900">Test real de livrare</h2>
        <p className="mt-1 text-sm text-gray-500">
          Trimite testul, verifică manual inboxul, apoi confirmă primirea. Nu confirma fără dovada mesajului.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={testRecipient}
            onChange={(event) => setTestRecipient(event.target.value)}
            className={inputClass}
            disabled={!canEdit}
          >
            {recipients.map((email) => <option key={email}>{email}</option>)}
          </select>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => void postAction(
                  'send-test',
                  { action: 'send_test', recipient: testRecipient },
                  'Furnizorul a acceptat testul. Verifică inboxul înainte de confirmare.',
                )}
                disabled={Boolean(busy)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === 'send-test' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Trimite test
              </button>
              <button
                type="button"
                onClick={() => void postAction(
                  'confirm-test',
                  { action: 'confirm_received', recipient: testRecipient },
                  'Primirea a fost confirmată pentru această adresă.',
                )}
                disabled={Boolean(busy) || !canConfirm}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-40"
              >
                {busy === 'confirm-test' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Confirmă primirea
              </button>
            </>
          )}
        </div>
        <dl className="mt-4 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
          <div><dt className="font-medium">Ultimul test</dt><dd>{settings.last_test_status || 'niciunul'} · {dateTime(settings.last_test_accepted_at)}</dd></div>
          <div><dt className="font-medium">ID furnizor</dt><dd className="break-all font-mono">{settings.last_test_provider_id || '—'}</dd></div>
          <div><dt className="font-medium">Ultima acceptare</dt><dd>{dateTime(settings.last_success_at)}</dd></div>
          <div><dt className="font-medium">Ultima eroare</dt><dd>{settings.last_error ? `${settings.last_error} · ${dateTime(settings.last_error_at)}` : '—'}</dd></div>
        </dl>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Jurnal recent</h2>
        </div>
        {data.recent_logs.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Nu există trimiteri înregistrate.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.recent_logs.map((log) => (
              <div key={log.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{log.recipient_email}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{log.subject}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    log.status === 'accepted' || log.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {log.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {dateTime(log.created_at)} · încercarea {log.attempt_number}
                  {log.error_message ? ` · ${log.error_message}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
