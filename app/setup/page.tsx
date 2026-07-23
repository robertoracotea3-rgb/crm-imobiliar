'use client';

import { useState } from 'react';
import { CheckCircle, Copy, ExternalLink, Loader2, AlertCircle, Key } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FULL_SETUP_SQL } from '@/components/SetupAlert';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
const SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;

export default function SetupPage() {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<Record<string, string> | null>(null);
  const [pat, setPat] = useState('');
  const [patFixing, setPatFixing] = useState(false);
  const [patResult, setPatResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [manualCopied, setManualCopied] = useState(false);

  const check = async () => {
    try {
      setChecking(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const d = await res.json();
      setResults(d.results || {});
    } finally {
      setChecking(false);
    }
  };

  const patFix = async () => {
    if (!pat.trim()) return;
    setPatFixing(true);
    setPatResult(null);
    try {
      const res = await fetch('/api/supabase-run-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: pat.trim(), query: FULL_SETUP_SQL }),
      });
      const d = await res.json();
      if (d.ok) {
        setPatResult({ ok: true, msg: 'Fix aplicat cu succes! Apasa "Verifica setup" pentru confirmare.' });
        await new Promise(r => setTimeout(r, 800));
        check();
      } else {
        const errDetail = typeof d.data === 'object' ? JSON.stringify(d.data) : (d.data || d.error || 'Eroare necunoscuta');
        setPatResult({ ok: false, msg: `Eroare (${d.status}): ${errDetail}` });
      }
    } catch (err) {
      setPatResult({ ok: false, msg: String(err) });
    } finally {
      setPatFixing(false);
    }
  };

  const manualCopyOpen = async () => {
    try { await navigator.clipboard.writeText(FULL_SETUP_SQL); setManualCopied(true); } catch {}
    setTimeout(() => window.open(SQL_EDITOR_URL, '_blank'), 200);
  };

  const allOk = results && Object.values(results).every(v => v === 'ok' || v === 'done');

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: '#0E6B54' }}>Setup Baza de Date</h1>
      <p className="text-gray-500 text-sm mb-6">
        Configureaza schema bazei de date. Trebuie facut o singura data.
      </p>

      {/* METHOD A: PAT auto-fix */}
      <div className="bg-white border-2 rounded-xl p-5 mb-4" style={{ borderColor: '#0E6B54' }}>
        <div className="flex items-center gap-2 mb-1">
          <Key size={18} style={{ color: '#0E6B54' }} />
          <p className="font-bold text-gray-800">Metoda A — Fix automat (recomandat)</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Introdu token-ul Supabase și apăsăm butonul — gata, fără pași manuali.
        </p>

        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600">
          <p className="font-semibold mb-1">Cum obții token-ul (30 secunde):</p>
          <ol className="space-y-0.5 list-decimal list-inside">
            <li>
              Mergi la{' '}
              <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer"
                className="underline text-emerald-700 font-medium">
                supabase.com → Account → Access Tokens
              </a>
            </li>
            <li>Click <strong>„Generate new token”</strong>, dă-i un nume (ex: CRM fix)</li>
            <li>Copiaza token-ul generat și lipeste-l mai jos</li>
          </ol>
        </div>

        <div className="flex gap-2 mb-2">
          <input
            type="password"
            value={pat}
            onChange={e => setPat(e.target.value)}
            placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-800"
          />
          <button onClick={patFix} disabled={patFixing || !pat.trim()}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: '#0E6B54' }}>
            {patFixing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {patFixing ? 'Se aplica...' : 'Aplica fix automat'}
          </button>
        </div>

        {patResult && (
          <div className={`p-3 rounded-lg text-sm ${patResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {patResult.msg}
          </div>
        )}
      </div>

      {/* METHOD B: manual copy+open */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
        <p className="font-bold text-gray-800 mb-1">Metoda B — Copiaza SQL și rulează în Supabase</p>
        <p className="text-xs text-gray-500 mb-3">Apasă butonul: copiaza SQL + deschide Supabase SQL Editor automat.</p>

        <button onClick={manualCopyOpen}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg text-sm font-bold hover:opacity-90 mb-2"
          style={{ backgroundColor: manualCopied ? '#16a34a' : '#374151' }}>
          {manualCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
          {manualCopied ? 'SQL copiat! ✓ — Paste (Ctrl+V) în Supabase → Run' : 'Copiaza SQL + Deschide Supabase Editor'}
          {!manualCopied && <ExternalLink size={15} />}
        </button>

        {manualCopied && (
          <p className="text-xs text-gray-500 text-center">
            În Supabase: <kbd className="bg-gray-200 px-1 rounded font-mono">Ctrl+V</kbd> →{' '}
            <kbd className="bg-gray-200 px-1 rounded font-mono">Ctrl+Enter</kbd> → revino și verifică
          </p>
        )}
      </div>

      {/* Verify */}
      <button onClick={check} disabled={checking}
        className="flex items-center gap-2 px-5 py-2.5 border-2 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 mb-5"
        style={{ borderColor: '#0E6B54', color: '#0E6B54' }}>
        {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        {checking ? 'Se verifica...' : 'Verifica setup'}
      </button>

      {results && (
        <div className={`rounded-xl border p-4 mb-5 ${allOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`font-semibold text-sm mb-2 ${allOk ? 'text-green-800' : 'text-amber-800'}`}>
            {allOk ? '✓ Totul configurat corect!' : '⚠ Schema necesita inca SQL manual'}
          </p>
          {Object.entries(results).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              {val === 'ok' || val === 'done'
                ? <CheckCircle size={12} className="text-green-600" />
                : <AlertCircle size={12} className="text-amber-600" />}
              <span className="font-mono text-gray-700">{key}:</span>
              <span className={val === 'ok' || val === 'done' ? 'text-green-700' : 'text-amber-700'}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* SQL preview */}
      <details className="mt-2">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
          Arata SQL complet...
        </summary>
        <div className="bg-gray-900 rounded-xl overflow-hidden mt-2">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
            <span className="text-xs text-gray-400 font-mono">setup.sql</span>
            <button onClick={async () => { await navigator.clipboard.writeText(FULL_SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
              {copied ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
              {copied ? 'Copiat!' : 'Copiaza'}
            </button>
          </div>
          <pre className="text-xs text-green-300 p-4 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">
            {FULL_SETUP_SQL}
          </pre>
        </div>
      </details>
    </div>
  );
}
