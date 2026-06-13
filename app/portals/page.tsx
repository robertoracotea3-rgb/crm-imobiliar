'use client';

import { useState, useEffect } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PortalsList } from '@/components/PortalsList';
import { Globe, Zap, Copy, CheckCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Portal {
  id: string;
  name: string;
  description: string;
  url: string;
  status: 'active' | 'inactive' | 'error' | 'coming_soon';
  properties_published?: number;
}

const PORTALS: Portal[] = [
  { id: '0', name: 'Site Propriu Fortis', description: 'fortisfagaras.ro — site-ul propriu al agenției', url: 'https://fortisfagaras.ro', status: 'active' },
  { id: '1', name: 'Imobiliare.ro', description: 'Cel mai mare portal imobiliar din România', url: 'https://imobiliare.ro', status: 'coming_soon' },
  { id: '2', name: 'OLX Imobiliare', description: 'Marketplace generalist cu secțiune imobiliară', url: 'https://olx.ro', status: 'coming_soon' },
  { id: '3', name: 'Storia', description: 'Platformă de închirieri și vânzări', url: 'https://storia.ro', status: 'coming_soon' },
  { id: '4', name: 'Anuntul.ro', description: 'Portal de anunțuri imobiliare', url: 'https://anuntul.ro', status: 'coming_soon' },
];

export default function PortalsPage() {
  const portals = PORTALS;
  const [agencyId, setAgencyId] = useState('');
  const [copied, setCopied] = useState(false);
  const activeCount = PORTALS.filter(p => p.status === 'active').length;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/settings', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json())
        .then(d => { if (d.agency?.id) setAgencyId(d.agency.id); });
    });
  }, []);

  const feedUrl = agencyId ? `${window.location.origin}/api/feed/properties.xml?agency_id=${agencyId}` : '';

  const copyFeed = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfigure = (_portal: Portal) => {
    // No-op: portals integration coming soon
  };

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Globe size={26} style={{ color: '#0E6B54' }} />
          <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Portaluri</h1>
        </div>

        {/* Coming soon banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 flex gap-3">
          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 text-sm">Integrare portale — în curând</p>
            <p className="text-blue-700 text-sm mt-1">
              Publicarea automată pe Imobiliare.ro, OLX, Storia va fi disponibilă în versiunea 2.0.
              Folosește feed-ul XML pentru integrări manuale sau prin conectori terți.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: '#0E6B54' }}>{activeCount}</p>
            <p className="text-xs text-gray-500 mt-1">Conectate</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{portals.length}</p>
            <p className="text-xs text-gray-500 mt-1">Disponibile</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">0</p>
            <p className="text-xs text-gray-500 mt-1">Publicate</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">XML</p>
            <p className="text-xs text-gray-500 mt-1">Feed activ</p>
          </div>
        </div>

        {/* Portals Grid */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Portale disponibile</h2>
          <PortalsList portals={portals} onConfigure={handleConfigure} />
        </div>

        {/* XML Feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3 mb-3">
            <Zap size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Feed XML proprietăți active</h3>
              <p className="text-xs text-gray-500 mt-0.5">Exportă toate proprietățile active în format XML standard.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg overflow-auto">
              {feedUrl || 'Se încarcă...'}
            </code>
            <button onClick={copyFeed} disabled={!feedUrl}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 disabled:opacity-40">
              {copied ? <><CheckCircle size={14} className="text-emerald-600" /> Copiat</> : <><Copy size={14} /> Copiază</>}
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
