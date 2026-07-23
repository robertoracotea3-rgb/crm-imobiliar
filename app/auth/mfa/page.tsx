'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, ShieldCheck, Smartphone } from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

interface Factor {
  id: string;
  status: string;
  friendly_name?: string;
}

export default function MfaPage() {
  const router = useRouter();
  const { user, loading: authLoading, security, refreshSecurity, signOut } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFactors = async () => {
    setLoading(true);
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError('Nu am putut verifica autentificarea în doi pași.');
    } else {
      setFactors(data.totp || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
      return undefined;
    }
    const timer = user ? window.setTimeout(() => void loadFactors(), 0) : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [authLoading, router, user]);

  const beginEnrollment = async () => {
    setBusy(true);
    setError('');
    try {
      for (const factor of factors.filter(item => item.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Kira CRM',
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch {
      setError('Configurarea 2FA nu a putut fi pornită. Verifică dacă TOTP este activ în Supabase.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Introdu codul de 6 cifre din aplicația de autentificare.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const verified = factors.find(item => item.status === 'verified');
      const selectedFactorId = factorId || verified?.id;
      if (!selectedFactorId) throw new Error('factor_missing');
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: selectedFactorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: selectedFactorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('session_missing');
      const response = await fetch('/api/auth/security', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'mfa_verified' }),
      });
      if (!response.ok) throw new Error('audit_failed');
      await refreshSecurity();
      router.replace('/dashboard');
    } catch {
      setError('Codul nu este valid sau a expirat. Folosește codul curent și încearcă din nou.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }

  const verifiedFactor = factors.find(item => item.status === 'verified');
  const enrollment = !verifiedFactor && qrCode;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-emerald-50 p-3 text-emerald-700"><ShieldCheck size={26} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Autentificare în doi pași</h1>
            <p className="text-sm text-gray-500">Protecție obligatorie pentru proprietar și administrator.</p>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {!verifiedFactor && !enrollment && (
          <div className="space-y-5">
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Ai nevoie de o aplicație Authenticator</p>
              <p className="mt-1">Poți folosi Google Authenticator, Microsoft Authenticator, 1Password sau altă aplicație TOTP.</p>
            </div>
            <button onClick={() => void beginEnrollment()} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
              Configurează 2FA
            </button>
          </div>
        )}

        {enrollment && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">Scanează codul QR, apoi introdu codul de 6 cifre generat de aplicație.</p>
            {/* Supabase returns an authenticated data:image SVG. CSP permits data images. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="Cod QR pentru autentificarea în doi pași" className="mx-auto h-56 w-56 rounded-lg border bg-white p-2" />
            <details className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <summary className="cursor-pointer font-medium">Nu poți scana? Arată cheia manuală</summary>
              <code className="mt-2 block break-all select-all">{secret}</code>
            </details>
          </div>
        )}

        {(verifiedFactor || enrollment) && (
          <div className="mt-5 space-y-3">
            <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700">Cod din aplicație</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 text-gray-400" size={20} />
              <input id="mfa-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-center text-lg tracking-[0.35em] text-gray-900"
                placeholder="000000" />
            </div>
            <button onClick={() => void verify()} disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="animate-spin" size={18} />}
              Verifică și continuă
            </button>
          </div>
        )}

        {!security?.mfaRequired && (
          <button onClick={() => router.push('/settings')} className="mt-4 w-full text-sm text-gray-500 hover:underline">
            Înapoi la setări
          </button>
        )}
        <button onClick={() => void signOut().then(() => router.replace('/login'))}
          className="mt-4 w-full text-sm text-red-600 hover:underline">
          Deconectare
        </button>
      </div>
    </div>
  );
}
