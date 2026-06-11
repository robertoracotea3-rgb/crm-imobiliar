'use client';

import { useEffect, useState } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PortalsList } from '@/components/PortalsList';
import { Globe, Zap } from 'lucide-react';

interface Portal {
  id: string;
  name: string;
  description: string;
  url: string;
  status: 'active' | 'inactive' | 'error';
  last_sync?: string;
  properties_published?: number;
}

export default function PortalsPage() {
  const [portals, setPortals] = useState<Portal[]>([
    {
      id: '1',
      name: 'Site Propriu',
      description: 'Website oficial al agentiei',
      url: 'https://example.com/properties',
      status: 'active',
      properties_published: 24,
      last_sync: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Imobiliare.ro',
      description: 'Cel mai mare portal imobiliar din Romania',
      url: 'https://imobiliare.ro',
      status: 'inactive',
      properties_published: 0,
    },
    {
      id: '3',
      name: 'OLX',
      description: 'Marketplace generalist cu sectiune imobiliara',
      url: 'https://olx.ro',
      status: 'error',
      last_sync: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '4',
      name: 'Storia',
      description: 'Platforma de inchirieri si vanzari',
      url: 'https://storia.ro',
      status: 'inactive',
      properties_published: 0,
    },
  ]);

  const handleConfigure = (portal: Portal) => {
    alert(`Configure ${portal.name}:\n\n- Credentiale API\n- Setari sincronizare\n- Categorii incluse`);
  };

  return (
    <ProtectedLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8" style={{ color: '#0E6B54' }}>
          Portaluri
        </h1>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex gap-4">
            <Zap size={24} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Publicare Automata</p>
              <p className="text-blue-800 text-sm mt-2">
                Activeaza portalurile pentru a sincroniza automat proprietatile tale.
                Odata configurat, noile proprietati se vor publica instant pe portalurile selectate.
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: '#0E6B54' }}>
              {portals.filter((p) => p.status === 'active').length}
            </p>
            <p className="text-sm text-gray-600">Conectate</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-orange-600">
              {portals.filter((p) => p.status === 'inactive').length}
            </p>
            <p className="text-sm text-gray-600">De configurat</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-600">
              {portals.filter((p) => p.status === 'error').length}
            </p>
            <p className="text-sm text-gray-600">Cu probleme</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: '#0E6B54' }}>
              {portals.reduce((sum, p) => sum + (p.properties_published || 0), 0)}
            </p>
            <p className="text-sm text-gray-600">Proprietati publicate</p>
          </div>
        </div>

        {/* Portals Grid */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#0E6B54' }}>
            Portaluri Disponibile
          </h2>
          <PortalsList portals={portals} onConfigure={handleConfigure} />
        </div>

        {/* XML Feed */}
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4" style={{ borderColor: '#B57514' }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Feed XML</h3>
              <p className="text-sm text-gray-600 mb-4">
                Exporta proprietatile in format XML pentru integrari externe.
              </p>
              <code className="text-xs bg-gray-100 px-3 py-2 rounded block max-w-2xl overflow-auto">
                /api/feed/properties.xml
              </code>
            </div>
            <button
              onClick={() => window.open('/api/feed/properties.xml', '_blank')}
              className="px-4 py-2 text-white rounded-lg font-medium transition-colors hover:opacity-90"
              style={{ backgroundColor: '#B57514' }}
            >
              Descarca Feed
            </button>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
