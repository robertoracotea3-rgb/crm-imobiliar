'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    user,
    loading,
    mfaRequired,
    mfaMethod,
    authError,
    completeMfa,
    signOut,
  } = useAuth();
  const [code, setCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleMfaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerifying(true);
    setMfaError('');
    try {
      await completeMfa(code);
      setCode('');
    } catch {
      setMfaError('Codul nu a fost acceptat. Verifică-l și încearcă din nou.');
    } finally {
      setVerifying(false);
    }
  };

  const handleReauthentication = async () => {
    try {
      await signOut();
    } finally {
      router.replace('/login');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Se încarcă...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (mfaRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F5F1] p-4">
        <form
          onSubmit={handleMfaSubmit}
          className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm"
        >
          <h1 className="mb-2 text-2xl font-bold text-[#0E6B54]">Verificare în doi pași</h1>
          <p className="mb-6 text-sm text-gray-600">
            {mfaMethod === 'phone'
              ? 'Introdu codul primit pe telefon pentru a continua.'
              : 'Introdu codul din aplicația de autentificare pentru a continua.'}
          </p>
          <label htmlFor="crm-mfa-code" className="mb-2 block text-sm font-medium text-gray-700">
            Cod de verificare
          </label>
          <input
            id="crm-mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\\D/g, '').slice(0, 6))}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg tracking-[0.3em] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="••••••"
          />
          {(mfaError || authError) && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {mfaError || authError}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="mt-6 w-full rounded-lg bg-[#0E6B54] px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verifying ? 'Se verifică…' : 'Verifică și continuă'}
          </button>
          <button
            type="button"
            onClick={() => void handleReauthentication()}
            className="mt-4 w-full text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Ieși din cont
          </button>
        </form>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F5F1] p-4">
        <section className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-3 text-2xl font-bold text-[#0E6B54]">Sesiune expirată</h1>
          <p className="text-sm text-gray-600">{authError}</p>
          <button
            type="button"
            onClick={() => void handleReauthentication()}
            className="mt-6 w-full rounded-lg bg-[#0E6B54] px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Autentifică-te din nou
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
