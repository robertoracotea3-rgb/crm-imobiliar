'use client';

import { useState } from 'react';
import { Copy, ExternalLink, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
const SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;

export const FULL_SETUP_SQL = `-- ===== CRM Imobiliar - Setup complet =====

-- 1. Reload schema cache (fix eroare location / address)
NOTIFY pgrst, 'reload schema';

-- 2. Creeaza tabela contacts daca nu exista
CREATE TABLE IF NOT EXISTS contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT, phone2 TEXT, email TEXT,
  cnp TEXT, address TEXT, type TEXT DEFAULT 'proprietar',
  notes TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Adauga coloane lipsa in contacts (daca tabela exista cu schema mai veche)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone2 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cnp TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 4. Dezactiveaza RLS pe contacts
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;

-- 5. Permisiuni
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 6. Reload schema din nou dupa modificari
NOTIFY pgrst, 'reload schema';`;

export function SetupAlert({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [pat, setPat] = useState('');
  const [fixResult, setFixResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPat, setShowPat] = useState(false);

  const isSchemaError = message.includes('schema cache') || message.includes('Could not find');
  const isContactsError = message.toLowerCase().includes('contacts') && message.includes('exist');

  if (!isSchemaError && !isContactsError) return null;

  const handleCopyOpen = async () => {
    try { await navigator.clipboard.writeText(FULL_SETUP_SQL); setCopied(true); } catch {}
    setTimeout(() => window.open(SQL_EDITOR_URL, '_blank'), 200);
  };

  const handleAutoFix = async () => {
    if (!pat.trim()) return;
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/supabase-run-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: pat.trim(), query: FULL_SETUP_SQL }),
      });
      const d = await res.json();
      if (d.ok) {
        setFixResult({ ok: true, msg: 'Fix aplicat! Incearca din nou sa salvezi.' });
      } else {
        setFixResult({ ok: false, msg: `Eroare: ${JSON.stringify(d.data || d.error)}` });
      }
    } catch (err) {
      setFixResult({ ok: false, msg: String(err) });
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mt-2">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">Schema baza de date nu e actualizata</p>
          <p className="text-xs text-amber-700 mt-0.5">Alege una din cele doua metode de mai jos:</p>
        </div>
      </div>

      {/* Method A: auto-fix with PAT */}
      <div className="mb-3">
        <button onClick={() => setShowPat(!showPat)}
          className="text-xs font-semibold text-amber-800 underline mb-2 block">
          Metoda A (automat): Fix cu token Supabase {showPat ? '▲' : '▼'}
        </button>
        {showPat && (
          <div className="space-y-2">
            <p className="text-xs text-amber-700">
              Obține token-ul de la{' '}
              <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer"
                className="underline font-medium">supabase.com → Account → Access Tokens</a>
              {' '}→ „Generate new token”
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={pat}
                onChange={e => setPat(e.target.value)}
                placeholder="sbp_xxxxxxxxxxxxxxxx"
                className="flex-1 text-xs px-2 py-1.5 border border-amber-300 rounded bg-white text-gray-800"
              />
              <button onClick={handleAutoFix} disabled={fixing || !pat.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-white text-xs rounded font-semibold disabled:opacity-50"
                style={{ backgroundColor: '#0E6B54' }}>
                {fixing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                {fixing ? 'Se aplica...' : 'Aplica fix'}
              </button>
            </div>
            {fixResult && (
              <p className={`text-xs p-2 rounded ${fixResult.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {fixResult.msg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Method B: manual copy+open */}
      <div>
        <p className="text-xs font-semibold text-amber-800 mb-2">Metoda B (manual): Copiaza SQL + Supabase Editor</p>
        <button onClick={handleCopyOpen}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-white rounded-lg text-xs font-semibold hover:opacity-90"
          style={{ backgroundColor: '#0E6B54' }}>
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          {copied ? 'SQL Copiat! ✓' : 'Copiaza SQL'}&nbsp;
          <ExternalLink size={12} />→ Deschide Supabase SQL Editor
        </button>
        {copied && (
          <p className="text-xs text-amber-700 mt-1.5 text-center">
            Paste (<kbd className="bg-amber-200 px-1 rounded font-mono">Ctrl+V</kbd>) in Supabase →{' '}
            <kbd className="bg-amber-200 px-1 rounded font-mono">Ctrl+Enter</kbd> → Revino si incearca din nou
          </p>
        )}
      </div>
    </div>
  );
}
