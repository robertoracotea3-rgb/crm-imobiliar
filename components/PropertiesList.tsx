'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trash2, MapPin, Home, User } from 'lucide-react';
import { ActivityStatus } from './ActivityStatus';

const CAT_LABELS: Record<string, string> = {
  apartament: 'Apartament', casa_vila: 'Casă/Vilă', teren: 'Teren',
  spatiu_comercial: 'Spațiu comercial', spatiu_industrial: 'Industrial',
  birou: 'Birou', garaj: 'Garaj', pensiune_hotel: 'Pensiune/Hotel',
};

interface Property {
  id: string;
  internal_code: string;
  title: string;
  city?: string;
  county?: string;
  zone?: string;
  price: number | null;
  currency?: string;
  category: string;
  status?: string;
  agent_id?: string;
  created_at: string;
  attributes?: {
    location_text?: string;
    photos?: string[];
    tip_oferta?: string;
  } | null;
  days_since_update?: number;
  publications?: Array<{
    portal: string;
    isEnabled: boolean;
    status: 'published' | 'pending' | 'failed' | 'draft';
  }>;
}

interface PropertiesListProps {
  properties: Property[];
  onDelete?: (id: string) => void;
  canDelete?: boolean;
  statusColorMap?: Record<string, string>;
  statusLabelMap?: Record<string, string>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  agentNames?: Record<string, string>;
}

export function PropertiesList({
  properties,
  onDelete,
  canDelete = false,
  statusColorMap = {},
  statusLabelMap = {},
  selectedIds,
  onToggleSelect,
  agentNames = {},
}: PropertiesListProps) {
  const selectable = !!onToggleSelect;
  const getDaysAgo = (dateStr: string) => {
    const createdDate = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  if (properties.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">Nu ai proprietati inca.</p>
        <button
          className="mt-4 px-6 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: '#0E6B54' }}
        >
          + Adauga prima proprietate
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {properties.map((property) => {
        const firstPhoto = property.attributes?.photos?.[0];
        return (
          <div
            key={property.id}
            className={`bg-white rounded-xl border hover:shadow-md transition-all overflow-hidden ${selectedIds?.has(property.id) ? 'border-emerald-400 bg-emerald-50/30' : 'border-gray-200 hover:border-emerald-300'}`}
          >
            <div className="flex items-stretch">
              {/* Checkbox selectie bulk */}
              {selectable && (
                <div className="flex items-center px-3 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(property.id) ?? false}
                    onChange={() => onToggleSelect?.(property.id)}
                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
              {/* Foto */}
              <div className="relative w-28 md:w-36 flex-shrink-0">
                {firstPhoto ? (
                  <Image
                    src={firstPhoto}
                    alt={property.title}
                    fill
                    sizes="(max-width: 768px) 112px, 144px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center" style={{ minHeight: '90px' }}>
                    <Home size={28} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Continut */}
              <div className="flex-1 p-3 md:p-4 flex flex-col justify-between gap-2">
                {/* Rand 1: titlu + pret */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/properties/${property.id}`}>
                      <h3 className="font-bold text-gray-900 hover:text-emerald-700 cursor-pointer text-sm md:text-base leading-tight">
                        {property.title}
                      </h3>
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {property.internal_code}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 text-sm md:text-base">
                      {(property.price ?? 0).toLocaleString('ro-RO')} {property.currency || 'EUR'}
                    </p>
                  </div>
                </div>

                {/* Rand 2: locatie + status + buton */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      <MapPin size={13} className="text-emerald-600" />
                      {[property.city, property.county].filter(Boolean).join(', ') || property.attributes?.location_text || '-'}
                    </span>
                    {property.category && CAT_LABELS[property.category] && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {CAT_LABELS[property.category]}
                      </span>
                    )}
                    {property.agent_id && agentNames[property.agent_id] && (
                      <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        <User size={11} />
                        {agentNames[property.agent_id]}
                      </span>
                    )}
                    {property.status && property.status !== 'activa' && statusLabelMap[property.status] && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColorMap[property.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabelMap[property.status]}
                      </span>
                    )}
                    <ActivityStatus daysAgo={getDaysAgo(property.created_at)} />
                    {(() => {
                      const channels = [...new Set((property.publications || []).filter(p => p.isEnabled).map(p => p.portal))];
                      if (channels.length === 0) {
                        return <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Nepublicată</span>;
                      }
                      // Yellow on a single channel, green on 2+ (wider reach).
                      const cls = channels.length >= 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
                      return (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`} title={`Publicată pe: ${channels.join(', ')}`}>
                          Publicată
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/properties/${property.id}`}
                      className="px-4 py-1.5 text-sm font-semibold rounded-lg text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: '#0E6B54' }}
                    >
                      Detalii
                    </Link>
                    {canDelete && (
                      <button
                        onClick={() => onDelete?.(property.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Sterge"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
