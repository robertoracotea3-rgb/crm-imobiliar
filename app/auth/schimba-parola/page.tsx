'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Lock } from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Parolele nu se potrivesc.');
      return;
    }
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('session_missing');
      const response = await fetch('/api/auth/security', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'password_change',
          current_password: currentPassword,
          password,
          password_confirm: confirmation,
        }),
      });
      const result = await response.json();
      if (!response.ok && result.reauthenticate) {
        await supabase.auth.signOut({ scope: 'local' });
        router.replace(result.next_path || '/login');
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Parola nu a putut fi schimbată.');
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
      await supabase.auth.signOut({ scope: 'local' });
      router.replace(result.next_path || '/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Parola nu a putut fi schimbată.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-emerald-50 p-3 text-emerald-700"><KeyRound size={24} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Schimbă parola</h1>
            <p className="text-sm text-gray-500">Celelalte sesiuni vor fi deconectate.</p>
          </div>
        </div>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Parola curentă sau temporară</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={19} />
              <input type="password" autoComplete="current-password" maxLength={256}
                value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900" required />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Parolă nouă</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={19} />
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128}
                value={password} onChange={event => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900" required />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Confirmă parola</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={19} />
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128}
                value={confirmation} onChange={event => setConfirmation(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900" required />
            </div>
          </label>
          <p className="text-xs text-gray-500">
            Folosește 12–128 caractere și minimum trei tipuri: litere mici, litere mari, cifre și simboluri.
          </p>
          <button type="submit" disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 className="animate-spin" size={18} />}
            Salvează parola
          </button>
        </form>
      </div>
    </div>
  );
}
