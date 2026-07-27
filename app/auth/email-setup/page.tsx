'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { MAIL_DOMAIN, normalizeMailLocalPart, validateMailLocalPart } from '@/lib/mail';
import { supabase } from '@/lib/supabase';

type SetupResponse = {
  mailbox?: { id: string; address: string } | null;
  can_claim?: boolean;
  suggestions?: string[];
  error?: string;
};

export default function EmailSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshSecurity, signOut } = useAuth();
  const [localPart, setLocalPart] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const validationError = useMemo(() => validateMailLocalPart(localPart), [localPart]);
  const preview = `${normalizeMailLocalPart(localPart) || 'nume.prenume'}@${MAIL_DOMAIN}`;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
      return;
    }
    if (!user) return;
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/mail/setup', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as SetupResponse;
      if (!response.ok) throw new Error(payload.error || 'Configurarea nu poate fi încărcată.');
      if (cancelled) return;
      if (payload.mailbox?.address) {
        router.replace('/mail');
        return;
      }
      if (payload.can_claim === false) throw new Error('Rolul tău nu permite crearea unei adrese personale.');
      const nextSuggestions = payload.suggestions || [];
      setSuggestions(nextSuggestions);
      setLocalPart(nextSuggestions[0] || '');
    }).catch(caught => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Configurarea nu poate fi încărcată.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading, router, user]);

  const claim = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!confirmed) {
      setError('Confirmă că ai verificat adresa și că înțelegi că nu o vei putea schimba.');
      return;
    }
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/mail/setup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          local_part: normalizeMailLocalPart(localPart),
          confirm_permanent: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Adresa nu a putut fi creată.');
      await refreshSecurity();
      router.replace('/mail');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Adresa nu a putut fi creată.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-emerald-700" size={28} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <section className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <Mail size={28} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Ultimul pas</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">Alege adresa ta Kira</h1>
            <p className="mt-1 text-sm text-gray-600">
              Aceasta va fi adresa din care vei răspunde clienților direct din CRM.
            </p>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <ShieldCheck size={18} className="mb-2" />
            Inbox privat, protejat prin contul CRM
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <AtSign size={18} className="mb-2" />
            Domeniu oficial kiraimobiliare.ro
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <LockKeyhole size={18} className="mb-2" />
            Alegerea se face o singură dată
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={claim} className="space-y-5">
          {suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Sugestii</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocalPart(value)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      normalizeMailLocalPart(localPart) === value
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {value}@{MAIL_DOMAIN}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-800">Adresa dorită</span>
            <div className="flex overflow-hidden rounded-xl border border-gray-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
              <input
                value={localPart}
                onChange={event => setLocalPart(normalizeMailLocalPart(event.target.value))}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={30}
                className="min-w-0 flex-1 px-4 py-3 text-gray-900 outline-none"
                placeholder="nume.prenume"
                aria-describedby="mail-preview mail-rules"
              />
              <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
                @{MAIL_DOMAIN}
              </span>
            </div>
            <span id="mail-rules" className="mt-2 block text-xs text-gray-500">
              3–30 caractere. Poți folosi litere mici, cifre, punct, cratimă și underscore.
            </span>
          </label>

          <div id="mail-preview" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Adresa ta va fi</p>
            <p className="mt-1 break-all text-lg font-bold text-emerald-950">{preview}</p>
            {!validationError && <CheckCircle2 className="mx-auto mt-2 text-emerald-600" size={20} />}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-700"
            />
            <span className="text-sm text-amber-950">
              Am verificat scrierea adresei. Înțeleg că adresa rămâne legată de cont și nu poate fi redenumită.
            </span>
          </label>

          <button
            type="submit"
            disabled={saving || Boolean(validationError) || !confirmed}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? <Loader2 className="animate-spin" size={19} /> : <Mail size={19} />}
            Creează adresa și deschide inboxul
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut().then(() => router.replace('/login'))}
          className="mt-4 w-full text-center text-sm text-gray-500 hover:text-red-600"
        >
          Deconectare
        </button>
      </section>
    </main>
  );
}
