'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, Clock3, KeyRound, Loader2, LogOut, MonitorSmartphone, ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

interface SessionItem {
  session_id: string;
  aal: string;
  created_at: string;
  last_seen_at: string;
  user_agent: string;
  revoked_at: string | null;
  current: boolean;
}

interface SecurityData {
  aal: string;
  mfa_required: boolean;
  factors: Array<{ id: string; status: string; factor_type: string; friendly_name: string | null }>;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Sesiunea a expirat.');
  return data.session.access_token;
}

export function AccountSecurityPanel() {
  const { signOut } = useAuth();
  const [security, setSecurity] = useState<SecurityData | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await accessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [securityResponse, sessionsResponse] = await Promise.all([
        fetch('/api/auth/security', { headers, cache: 'no-store' }),
        fetch('/api/auth/sessions', { headers, cache: 'no-store' }),
      ]);
      const securityResult = await securityResponse.json();
      const sessionsResult = await sessionsResponse.json();
      if (!securityResponse.ok || !sessionsResponse.ok) throw new Error('Datele de securitate nu sunt disponibile.');
      setSecurity(securityResult);
      setSessions(sessionsResult.sessions || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Datele de securitate nu sunt disponibile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const revoke = async (scope: 'others' | 'global') => {
    if (scope === 'global' && !window.confirm('Deconectezi toate dispozitivele, inclusiv acesta?')) return;
    setBusy(scope);
    setError('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sesiunile nu au putut fi revocate.');
      if (scope === 'global') {
        await supabase.auth.signOut({ scope: 'local' });
        window.location.href = '/login';
        return;
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sesiunile nu au putut fi revocate.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }

  const verifiedFactors = security?.factors.filter(factor => factor.status === 'verified') || [];
  const activeSessions = sessions.filter(session => !session.revoked_at);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <ShieldCheck className={verifiedFactors.length ? 'text-emerald-600' : 'text-amber-600'} />
            <div>
              <p className="font-semibold text-gray-900">Autentificare în doi pași</p>
              <p className="mt-1 text-sm text-gray-500">
                {verifiedFactors.length
                  ? `Activă · ${verifiedFactors.length} factor verificat`
                  : security?.mfa_required ? 'Obligatorie pentru rolul tău' : 'Recomandată pentru protecția contului'}
              </p>
            </div>
          </div>
          <Link href="/auth/mfa" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            {verifiedFactors.length ? <CheckCircle2 size={17} /> : <KeyRound size={17} />}
            {verifiedFactors.length ? 'Verifică 2FA' : 'Activează 2FA'}
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-gray-900">Parolă</p>
            <p className="mt-1 text-sm text-gray-500">Schimbarea parolei revocă toate sesiunile și cere o autentificare nouă.</p>
          </div>
          <Link href="/auth/schimba-parola" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
            <KeyRound size={17} /> Schimbă parola
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-gray-900">Sesiuni active</p>
            <p className="mt-1 text-sm text-gray-500">{activeSessions.length} dispozitive; expirare la 12 ore, inactivitate 30 minute.</p>
          </div>
          <button onClick={() => void load()} className="text-sm font-medium text-emerald-700">Reîncarcă</button>
        </div>
        <div className="space-y-2">
          {activeSessions.map(session => (
            <div key={session.session_id} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <MonitorSmartphone className="mt-0.5 shrink-0 text-gray-500" size={19} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {session.user_agent}{session.current ? ' · Acest dispozitiv' : ''}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Clock3 size={13} /> Activ: {new Date(session.last_seen_at).toLocaleString('ro-RO')}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{session.aal.toUpperCase()}</span>
            </div>
          ))}
          {!activeSessions.length && <p className="text-sm text-gray-500">Nu există sesiuni active în registru.</p>}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button onClick={() => void revoke('others')} disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-50">
            {busy === 'others' ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
            Deconectează celelalte dispozitive
          </button>
          <button onClick={() => void revoke('global')} disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === 'global' ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
            Deconectează toate dispozitivele
          </button>
        </div>
      </div>

      <button onClick={() => void signOut()} className="text-sm text-gray-500 hover:underline">
        Deconectează doar sesiunea curentă
      </button>
    </div>
  );
}
