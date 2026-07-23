'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  Globe, Zap, Copy, CheckCircle, Info, ExternalLink, Link2, Link2Off,
  RefreshCw, Loader2, AlertCircle, Building2, KeyRound, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

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
  connection_status: 'disconnected' | 'connected' | 'reconnect_required' | 'revoked';
  connected_at: string | null;
  expires_at: string | null;
  last_refreshed_at: string | null;
  refresh_failure_count: number;
  last_refresh_error_code: string | null;
  credentials_configured: boolean;
  listings: StoriaListing[];
}

interface FeedToken {
  id: string;
  portal: 'generic' | 'storia';
  label: string;
  token_prefix: string;
  is_active: boolean;
  generation: number;
  created_at: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
}

interface FeedLog {
  id: string;
  token_id: string | null;
  portal: string;
  status: 'success' | 'invalid_xml' | 'error';
  included_count: number;
  excluded_count: number;
  error_count: number;
  duration_ms?: number | null;
  generated_at: string;
}

const LISTING_STATUS_LABEL: Record<string, string> = {
  pending:  'În așteptare',
  to_post:  'În așteptare',
  to_put:   'Se actualizează',
  active:   'Activ',
  rejected: 'Respins',
  expired:  'Expirat',
  deleted:  'Șters',
  error:    'Eroare',
  limited:  'Limitat',
};
const LISTING_STATUS_COLOR: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800',
  to_post:  'bg-amber-100 text-amber-800',
  to_put:   'bg-blue-100 text-blue-700',
  active:   'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
  deleted:  'bg-gray-100 text-gray-500',
  error:    'bg-red-100 text-red-700',
  limited:  'bg-blue-100 text-blue-700',
};

const STORIA_OAUTH_ERROR: Record<string, string> = {
  invalid_state: 'Cererea de conectare nu este validă. Pornește din nou conectarea.',
  invalid_or_expired_state: 'Cererea de conectare a expirat sau a fost deja folosită.',
  authorization_denied: 'Autorizarea a fost refuzată în Storia.',
  authorization_failed: 'Storia nu a putut autoriza această conectare.',
  authorization_code_missing: 'Storia nu a trimis codul de autorizare.',
  configuration_missing: 'Configurarea securizată Storia este incompletă.',
  oauth_storage_failed: 'Conectarea a reușit, dar acreditările nu au putut fi salvate.',
  oauth_invalid_token_response: 'Storia a trimis un răspuns de autorizare invalid.',
  oauth_failed: 'Conectarea Storia nu a putut fi finalizată.',
};

export default function PortalsPage() {
  const { can } = useAuth();
  const [token, setToken] = useState('');
  const [feedTokens, setFeedTokens] = useState<FeedToken[]>([]);
  const [feedLogs, setFeedLogs] = useState<FeedLog[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedBusy, setFeedBusy] = useState('');
  const [revealedFeedUrl, setRevealedFeedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [storia, setStoria] = useState<StoriaStatus | null>(null);
  const [loadingStoria, setLoadingStoria] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Read URL params for OAuth callback result
  const [flashMsg, setFlashMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let message: { type: 'success' | 'error'; text: string } | null = null;
    if (params.get('storia_connected')) {
      message = { type: 'success', text: 'Contul Storia a fost conectat cu succes!' };
    } else if (params.get('storia_error')) {
      const errorCode = params.get('storia_error') || 'oauth_failed';
      message = {
        type: 'error',
        text: STORIA_OAUTH_ERROR[errorCode] || 'Conectarea Storia nu a putut fi finalizată.',
      };
    }
    if (!message) return;
    window.history.replaceState({}, '', '/portals');
    const timer = window.setTimeout(() => setFlashMsg(message), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchData = useCallback(async (tok: string) => {
    setLoadingStoria(true);
    setFeedLoading(true);
    try {
      const [storiaRes, feedsRes] = await Promise.all([
        fetch('/api/portals/storia/status', { headers: { Authorization: `Bearer ${tok}` } }),
        fetch('/api/feed/tokens', { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      if (storiaRes.ok) setStoria(await storiaRes.json());
      if (feedsRes.ok) {
        const data = await feedsRes.json();
        setFeedTokens(data.tokens || []);
        setFeedLogs(data.recent_logs || []);
      }
    } finally {
      setLoadingStoria(false);
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setToken(session.access_token);
      fetchData(session.access_token);
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
    try {
      const response = await fetch('/api/portals/storia/disconnect', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFlashMsg({
          type: 'error',
          text: result.error || 'Contul Storia nu a putut fi deconectat.',
        });
        return;
      }
      setFlashMsg({ type: 'success', text: 'Contul Storia a fost deconectat în siguranță.' });
      await fetchData(token);
    } finally {
      setDisconnecting(false);
    }
  };

  const copyFeed = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateFeed = async (portal: 'generic' | 'storia') => {
    let ownerEmail = '';
    if (portal === 'storia') {
      ownerEmail = window.prompt('E-mailul agenției folosit în contul Storia:')?.trim() || '';
      if (!ownerEmail) return;
    }
    setFeedBusy(`create:${portal}`);
    try {
      const res = await fetch('/api/feed/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal, owner_email: ownerEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlashMsg({ type: 'error', text: data.error || 'Feedul nu a putut fi creat' });
        return;
      }
      setRevealedFeedUrl(data.feed_url || '');
      setFlashMsg({ type: 'success', text: 'Feed securizat creat. Copiază URL-ul înainte să închizi pagina.' });
      await fetchData(token);
    } finally {
      setFeedBusy('');
    }
  };

  const handleFeedAction = async (id: string, action: 'rotate' | 'revoke') => {
    const question = action === 'rotate'
      ? 'Rotești tokenul? URL-ul vechi nu va mai funcționa.'
      : 'Revoci feedul? Portalul nu îl va mai putea descărca.';
    if (!window.confirm(question)) return;
    setFeedBusy(`${action}:${id}`);
    try {
      const res = await fetch('/api/feed/tokens', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlashMsg({ type: 'error', text: data.error || 'Acțiunea asupra feedului a eșuat' });
        return;
      }
      if (data.feed_url) setRevealedFeedUrl(data.feed_url);
      setFlashMsg({
        type: 'success',
        text: action === 'rotate' ? 'Token rotit. Copiază noul URL acum.' : 'Feed revocat.',
      });
      await fetchData(token);
    } finally {
      setFeedBusy('');
    }
  };

  const activeListings = storia?.listings.filter(l => l.status === 'active').length ?? 0;
  const totalListings  = storia?.listings.length ?? 0;
  const activeFeeds = feedTokens.filter(feed => feed.is_active).length;

  // Blochează randarea pentru non-owner (redirect gestionat în useEffect)
  return (
    <ProtectedLayout module="portals">
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
            <p className="text-2xl font-bold text-purple-600">{activeFeeds}</p>
            <p className="text-xs text-gray-500 mt-1">Feeduri XML active</p>
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
                  <button onClick={() => fetchData(token)}
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
                  {[
                    'STORIA_CLIENT_ID',
                    'STORIA_CLIENT_SECRET',
                    'STORIA_API_KEY',
                    'STORIA_WEBHOOK_SECRET',
                    'PORTAL_TOKEN_ENCRYPTION_KEY',
                    'NEXT_PUBLIC_APP_URL = https://crm.kiraimobiliare.ro',
                  ].map(v => (
                    <code key={v} className="block text-xs bg-amber-100 text-amber-900 px-3 py-1.5 rounded">{v}</code>
                  ))}
                </div>
              </div>
            )}

            {/* Not connected / token expired state */}
            {storia?.credentials_configured && (!storia.connected || !storia.token_valid) && (
              <div className="mb-4">
                {storia.connection_status === 'reconnect_required' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                    Sesiunea Storia nu mai poate fi reînnoită. Reconectează contul pentru a continua publicarea.
                  </div>
                )}
                {storia.connection_status === 'revoked' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 text-xs text-gray-700">
                    Conexiunea anterioară a fost revocată. Este necesară o autorizare nouă.
                  </div>
                )}
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
                  {can('portals', 'delete') && (
                    <button onClick={handleDisconnect} disabled={disconnecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">
                      {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Link2Off size={12} />}
                      Deconectează
                    </button>
                  )}
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
                      Deschide o proprietate → secțiunea „Storia / OLX” → Publică
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

        {/* XML feeds */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Feeduri XML securizate</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fiecare portal primește un token separat, revocabil. Proprietățile sunt incluse numai dacă sunt active și bifate pentru canalul respectiv.
                </p>
              </div>
            </div>
            {can('feed', 'create') && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button type="button" onClick={() => handleCreateFeed('generic')} disabled={Boolean(feedBusy)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                  {feedBusy === 'create:generic' ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  Feed standard
                </button>
                <button type="button" onClick={() => handleCreateFeed('storia')} disabled={Boolean(feedBusy)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: '#0E6B54' }}>
                  {feedBusy === 'create:storia' ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                  Feed Storia
                </button>
              </div>
            )}
          </div>

          {revealedFeedUrl && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Copiază URL-ul acum</p>
              <p className="mt-1 text-xs text-amber-700">Din motive de securitate, tokenul complet nu va mai fi afișat după reîncărcarea paginii.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 overflow-auto rounded-lg bg-white px-3 py-2 text-xs text-gray-700">{revealedFeedUrl}</code>
                <button type="button" onClick={() => copyFeed(revealedFeedUrl)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">
                  {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                  {copied ? 'Copiat' : 'Copiază'}
                </button>
              </div>
            </div>
          )}

          {feedLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : feedTokens.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center">
              <KeyRound size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Nu există încă niciun feed securizat</p>
              <p className="mt-1 text-xs text-gray-400">Vechiul link bazat doar pe ID-ul agenției este dezactivat.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedTokens.map(feed => (
                <div key={feed.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{feed.label}</p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-gray-600">{feed.portal}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${feed.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {feed.is_active ? 'Activ' : 'Revocat'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-gray-500">{feed.token_prefix} · generația {feed.generation}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Ultimul succes: {feed.last_success_at ? new Date(feed.last_success_at).toLocaleString('ro-RO') : 'niciodată'}
                        {feed.last_error_at ? ' · ultima încercare a avut eroare' : ''}
                      </p>
                    </div>
                    {can('feed', 'edit') && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleFeedAction(feed.id, 'rotate')} disabled={Boolean(feedBusy)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                          {feedBusy === `rotate:${feed.id}` ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Rotește
                        </button>
                        {feed.is_active && (
                          <button type="button" onClick={() => handleFeedAction(feed.id, 'revoke')} disabled={Boolean(feedBusy)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
                            Revocă
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {feedLogs.length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ultimele exporturi</h4>
              <div className="space-y-2">
                {feedLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span className="font-medium text-gray-700">{log.portal} · {new Date(log.generated_at).toLocaleString('ro-RO')}</span>
                    <span className={log.status === 'success' ? 'text-emerald-700' : 'text-red-700'}>
                      {log.status === 'success' ? 'Valid' : 'Eroare'} · {log.included_count} incluse · {log.excluded_count} excluse
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}
