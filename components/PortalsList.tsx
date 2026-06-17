'use client';

import { Globe, Settings, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface Portal {
  id: string;
  name: string;
  description: string;
  url: string;
  status: 'active' | 'inactive' | 'error' | 'coming_soon';
  last_sync?: string;
  properties_published?: number;
}

interface PortalsListProps {
  portals: Portal[];
  onConfigure?: (portal: Portal) => void;
}

export function PortalsList({ portals, onConfigure }: PortalsListProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 size={20} className="text-green-600" />;
      case 'error':
        return <AlertCircle size={20} className="text-red-600" />;
      default:
        return <Clock size={20} className="text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '✅ Conectat';
      case 'error':
        return '❌ Eroare';
      default:
        return '⏳ Neconectat';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {portals.map((portal) => (
        <div
          key={portal.id}
          className="bg-white rounded-lg p-6 border border-gray-200 hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <Globe size={24} style={{ color: '#0E6B54' }} />
              <div>
                <h3 className="font-semibold text-gray-900">{portal.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{portal.description}</p>
              </div>
            </div>
            {getStatusIcon(portal.status)}
          </div>

          {/* Status */}
          <div className="mb-4">
            <span
              className="inline-block text-xs px-2 py-1 rounded font-medium"
              style={{
                backgroundColor:
                  portal.status === 'active'
                    ? '#DCFCE7'
                    : portal.status === 'error'
                    ? '#FEE2E2'
                    : '#F3F4F6',
                color:
                  portal.status === 'active'
                    ? '#166534'
                    : portal.status === 'error'
                    ? '#991B1B'
                    : '#4B5563',
              }}
            >
              {getStatusText(portal.status)}
            </span>
          </div>

          {/* Stats */}
          {portal.properties_published !== undefined && (
            <div className="text-sm text-gray-600 mb-4">
              <p>📊 {portal.properties_published} proprietati publicate</p>
              {portal.last_sync && (
                <p className="text-xs text-gray-500 mt-1">
                  Ultima sincronizare:{' '}
                  {new Date(portal.last_sync).toLocaleDateString('ro-RO')}
                </p>
              )}
            </div>
          )}

          {/* Link + Configure */}
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <a
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-3 py-2 text-xs text-center rounded border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Viziteaza Portal
            </a>
            <button
              onClick={() => onConfigure?.(portal)}
              className="flex-1 px-3 py-2 text-xs rounded font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: '#0E6B54' }}
            >
              <Settings size={16} className="inline mr-1" />
              Configureaza
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
