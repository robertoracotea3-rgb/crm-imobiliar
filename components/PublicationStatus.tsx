'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, AlertCircle, Clock, X } from 'lucide-react';

interface PublicationRecord {
  id: string;
  portal_name: string;
  is_enabled: boolean;
  status: 'published' | 'pending' | 'failed' | 'draft';
  external_id?: string;
  external_url?: string;
  last_error?: string;
  last_synced?: string;
}

interface PublicationStatusProps {
  propertyId: string;
  publications: PublicationRecord[];
  onToggle?: (portalName: string, enabled: boolean) => void;
}

export function PublicationStatus({
  propertyId,
  publications,
  onToggle,
}: PublicationStatusProps) {
  const [loading, setLoading] = useState<string>('');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published':
        return <CheckCircle2 size={16} className="text-green-600" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-600" />;
      case 'failed':
        return <AlertCircle size={16} className="text-red-600" />;
      default:
        return <X size={16} className="text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'published':
        return '✅ Publicat';
      case 'pending':
        return '⏳ In sincro...';
      case 'failed':
        return '❌ Eroare';
      default:
        return '⊘ Draft';
    }
  };

  const handleToggle = async (portalName: string, currentlyEnabled: boolean) => {
    try {
      setLoading(portalName);

      // Mock toggle - in realitate ar apela API
      console.log(`Toggle ${portalName}: ${currentlyEnabled ? 'disable' : 'enable'}`);

      // Simulare sync
      await new Promise((resolve) => setTimeout(resolve, 1000));

      onToggle?.(portalName, !currentlyEnabled);
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="space-y-2">
      {publications.map((pub) => (
        <div
          key={pub.id}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div className="flex items-center gap-3 flex-1">
            <input
              type="checkbox"
              checked={pub.is_enabled}
              onChange={() => handleToggle(pub.portal_name, pub.is_enabled)}
              disabled={loading === pub.portal_name}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900">{pub.portal_name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                {getStatusIcon(pub.status)}
                <span>{getStatusText(pub.status)}</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex gap-2">
            {pub.external_url && (
              <a
                href={pub.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-200 transition-colors"
              >
                Vizualizează
              </a>
            )}
            {pub.last_error && (
              <div
                className="px-2 py-1 text-xs rounded bg-red-50 text-red-700"
                title={pub.last_error}
              >
                {pub.last_error.substring(0, 30)}...
              </div>
            )}
          </div>
        </div>
      ))}

      {publications.length === 0 && (
        <p className="text-sm text-gray-500 py-4">
          Nicio publicare configurata. Mergi la meniul "Portaluri" pentru a configura.
        </p>
      )}
    </div>
  );
}
