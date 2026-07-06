'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { User, Lock, Building2, KeyRound } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');

      if (password !== passwordConfirm) {
        setError('Parolele nu se potrivesc');
        return;
      }

      if (password.length < 12) {
        setError('Parola trebuie să aibă cel puțin 12 caractere');
        return;
      }

      // Creeaza contul via API server-side (fara email, fara rate limit)
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, agencyName, accessCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Eroare la inregistrare');
        return;
      }

      // Login automat dupa inregistrare
      const email = `${username.trim().toLowerCase().replace(/\s+/g, '.')}@fortis.crm`;
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la inregistrare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F6F5F1' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-kira.webp" alt="KIRA Imobiliare" width={360} height={240} className="h-24 w-auto mb-3" />
          <p className="text-gray-600">Creează contul tău de agenție</p>
        </div>

        <div className="bg-white rounded-lg p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-6" style={{ color: '#0E6B54' }}>
            Inregistrare
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cod de acces *</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 text-gray-500" size={20} />
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Cod primit de la administrator"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numele agentiei *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 text-gray-500" size={20} />
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="ex: Agentia Imobiliara XYZ"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nume utilizator *</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-500" size={20} />
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: roberto"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parola *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-500" size={20} />
                <input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minim 12 caractere"
                  minLength={12}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Minimum 12 caractere. Recomandat: litere mari și mici, cifre și simboluri.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirma parola *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-500" size={20} />
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Repetă parola"
                  minLength={12}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-white rounded-lg font-medium transition-colors hover:opacity-90 disabled:opacity-50 mt-6"
              style={{ backgroundColor: '#0E6B54' }}
            >
              {loading ? 'Se creeaza cont...' : 'Inregistrare'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Ai deja cont?{' '}
            <Link href="/login" className="font-medium hover:underline" style={{ color: '#0E6B54' }}>
              Logare
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
