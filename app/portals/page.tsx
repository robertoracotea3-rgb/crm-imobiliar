'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  Globe, Zap, Copy, CheckCircle, Info, ExternalLink, Link2, Link2Off,
  RefreshCw, Loader2, AlertCircle, Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StoriaListing {
  id: string;
  property_id: string;
  property_title?: string;
  internal_code?: string;
  external_id?: string;
  status: string;
  advert_url?: string;
  last_sync_at?: string;
  error_message?: string;
}

interface StoriaStatus {
  connected: boolean;
  token_valid: boolean;
  connected_at: string | null;
  credentials_configured: boolean;
  listings: StoriaListing[];
}

const LISTING_STATUS_LABEL: Record<string, string> = {
  pending:  'În așteptare',
  active:   'Activ',
  rejected: 'Respins',
  expired:  'Expirat',
  deleted:  'Șters',
  error:    'Eroare',
  limited:  'Limitat',
};
const LISTING_STATUS_COLOR: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800',
  active:   'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
  deleted:  'bg-gray-100 text-gray-500',
  error:    'bg-red-100 text-red-700',
  limited:  'bg-blue-100 text-blue-700',
};

export default function PortalsPage() {
  const [token, setToken] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [storia, setStoria] = useState<StoriaStatus | null>(null);
  const [loadingStoria, setLoadingStoria] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Read URL params for OAuth callback result
  const [flashMsg, setFlashMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('storia_connected')) {
      setFlashMsg({ type: 'success', text: 'Contul Storia a fost conectat cu succes!' });
      window.history.replaceState({}, '', '/portals');
    } else if (params.get('storia_error')) {
      setFlashMsg({ type: 'error', text: `Eroare la conectare: ${decodeURIComponent(params.get('storia_error')!)}` });
      window.history.replaceState({}, '', '/portals');
    }
  }, []);

  const fetchData = useCallback(async (tok: string, aid: string) => {
    setLoadingStoria(true);
    try {
      const res = await fetch('/api/portals/storia/status', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setStoria(await res.json());
    } finally {
      setLoadingStoria(false);
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://crm.kiraimobiliare.ro';
    setFeedUrl(`${origin}/api/feed/properties.xml?agency_id=${aid}`);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setToken(session.access_token);
      fetch('/api/settings', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json())
        .then(d => {
          const aid = d.agency?.id || '';
          setAgencyId(aid);
          fetchData(session.access_token, aid);
        });
    });
  }, [fetchData]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/portals/storia/connect', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) {
        setFlashMsg({ type: 'error', text: d.error || 'Eroare la inițierea conectării' });
      } else if (d.url) {
        window.location.href = d.url;
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deconectezi contul Storia? Nu vei mai putea publica anunțuri automat.')) return;
    setDisconnecting(true);
    // Remove token from DB
    const res = await fetch('/api/portals/storia/status', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // Even if it fails, refresh status
    await fetchData(token, agencyId);
    setDisconnecting(false);
  };

  const copyFeed = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeListings = storia?.listings.filter(l => l.status === 'active').length ?? 0;
  const totalListings  = storia?.listings.length ?? 0;

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Globe size={26} style={{ color: '#0E6B54' }} />
          <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Portaluri</h1>
        </div>

        {/* Flash message */}
        {flashMsg && (
          <div className={`rounded-xl p-4 mb-5 flex items-start gap-3 ${flashMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            {flashMsg.type === 'success'
              ? <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              : <AlertCircle  size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
            <p className={`text-sm font-medium ${flashMsg.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
              {flashMsg.text}
            </p>
            <button onClick={() => setFlashMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: '#0E6B54' }}>1</p>
            <p className="text-xs text-gray-500 mt-1">Site propriu</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{activeListings}</p>
            <p className="text-xs text-gray-500 mt-1">Anunțuri active Storia</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{totalListings}</p>
            <p className="text-xs text-gray-500 mt-1">Total publicate</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">XML</p>
            <p className="text-xs text-gray-500 mt-1">Feed activ</p>
          </div>
        </div>

        {/* ──────────────────── STORIA / OLX CARD ──────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
            {/* Logo placeholder */}
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
              <Building2 size={24} className="text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900">Storia + OLX Imobiliare</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">OLX RE Partner API</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Publici pe Storia → apare automat și pe OLX Imobiliare
              </p>
            </div>
            <div className="flex-shrink-0">
              {loadingStoria ? (
                <Loader2 size={20} className="text-gray-300 animate-spin" />
              ) : storia?.connected && storia.token_valid ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <CheckCircle size={12} /> Conectat
                  </span>
                  <button onClick={() => fetchData(token, agencyId)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Reîncarcă">
                    <RefreshCw size={14} />
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  <Link2Off size={12} /> Neconectat
                </span>
              )}
            </div>
          </div>

          <div className="p-5">
            {/* Credentials not configured */}
            {!storia?.credentials_configured && !loadingStoria && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-amber-800 mb-1">Configurare necesară</p>
                <p className="text-xs text-amber-700 mb-3">
                  Adăugați variabilele în Vercel → Settings → Environment Variables:
                </p>
                <div className="space-y-1.5">
                  {['STORIA_CLIENT_ID', 'STORIA_CLIENT_SECRET', 'STORIA_API_KEY', 'STORIA_WEBHOOK_SECRET', 'NEXT_PUBLIC_APP_URL = https://crm.kiraimobiliare.ro'].map(v => (
                    <code key={v} className="block text-xs bg-amber-100 text-amber-900 px-3 py-1.5 rounded">{v}</code>
                  ))}
                </div>
              </div>
            )}

            {/* Not connected / token expired state */}
            {storia?.credentials_configured && (!storia.connected || !storia.token_valid) && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Conectați contul Storia pentru a publica anunțuri automat din CRM.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-700">
                  <strong>Pașii procesului:</strong> vei fi redirecționat pe Storia → autorizezi accesul → te întorci automat în CRM.
                </div>
                <button onClick={handleConnect} disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#0E6B54' }}>
                  {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                  {connecting ? 'Se deschide Storia...' : 'Conectează cont Storia'}
                </button>
              </div>
            )}

            {/* Connected state */}
            {storia?.connected && storia.token_valid && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-600">
                    {storia.connected_at
                      ? `Conectat pe ${new Date(storia.connected_at).toLocaleDateString('ro-RO')}`
                      : 'Cont conectat'}
                  </p>
                  <button onClick={handleDisconnect} disabled={disconnecting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">
                    {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Link2Off size={12} />}
                    Deconectează
                  </button>
                </div>

                {/* Listings table */}
                {storia.listings.length > 0 ? (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Anunțuri publicate</h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">ID intern</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Proprietate</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">ID Storia</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Status</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Ultima sincronizare</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {storia.listings.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-xs font-semibold text-gray-700">{l.internal_code || '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 max-w-[200px]">
                                <a href={`/properties/${l.property_id}`}
                                  className="text-xs text-emerald-700 hover:underline font-medium truncate block"
                                  title={l.property_title || l.property_id}>
                                  {l.property_title || l.property_id}
                                </a>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{l.external_id || '—'}</td>
                              <td className="px-3 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LISTING_STATUS_COLOR[l.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {LISTING_STATUS_LABEL[l.status] || l.status}
                                </span>
                                {l.error_message && (
                                  <p className="text-xs text-red-600 mt-0.5 truncate max-w-[200px]" title={l.error_message}>{l.error_message}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-gray-500">
                                {l.last_sync_at ? new Date(l.last_sync_at).toLocaleString('ro-RO') : '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                {l.advert_url && (
                                  <a href={l.advert_url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                                    <ExternalLink size={11} /> Deschide
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Publică sau actualizează anunțuri individuale din pagina fiecărei proprietăți.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                    <Building2 size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500 font-medium">Niciun anunț publicat încă</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Deschide o proprietate → secțiunea „Storia / OLX" → Publică
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Webhook info (always shown when connected) */}
            {storia?.connected && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-1">URL Webhook (pentru notificări OLX)</p>
                <code className="text-xs bg-gray-100 px-3 py-1.5 rounded block text-gray-700">
                  https://crm.kiraimobiliare.ro/api/portals/storia/webhook
                </code>
                <p className="text-xs text-gray-400 mt-1">Adăugați în Developer Hub → Webhook settings.</p>
              </div>
            )}
          </div>
        </div>

        {/* Other portals */}
        <div className="bg-white rounded-xl border border-gray-200 mb-4 p-5">
          <div className="flex items-center gap-3 mb-1">
            <Info size={16} className="text-blue-500 flex-shrink-0" />
            <h2 className="font-semibold text-gray-800 text-sm">Alte portale — în curând</h2>
          </div>
          <p className="text-sm text-gray-500 ml-7">
            Imobiliare.ro, Anuntul.ro și alte portale vor fi adăugate în versiunile viitoare.
          </p>
        </div>

        {/* XML Feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3 mb-3">
            <Zap size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Feed XML proprietăți active</h3>
              <p className="text-xs text-gray-500 mt-0.5">Export XML standard — pentru integrări manuale sau prin conectori terți.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg overflow-auto min-w-0">
              {feedUrl || 'Se încarcă...'}
            </code>
            <button onClick={copyFeed} disabled={!feedUrl}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 disabled:opacity-40">
              {copied ? <><CheckCircle size={14} className="text-emerald-600" /> Copiat</> : <><Copy size={14} /> Copiează</>}
            </button>
            {feedUrl && (
              <button onClick={() => window.open(feedUrl, '_blank')}
                className="px-3 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: '#0E6B54' }}>
                Deschide
              </button>
            )}
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
