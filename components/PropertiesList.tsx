'use client';

import Link from 'next/link';
import { Trash2, MapPin, DollarSign } from 'lucide-react';
import { ActivityStatus } from './ActivityStatus';
import { PublicationBadges } from './PublicationBadges';

interface Property {
  id: string;
  internal_code: string;
  title: string;
  location: string;
  price: number;
  category: string;
  created_at: string;
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
}

export function PropertiesList({
  properties,
  onDelete,
  canDelete = false,
}: PropertiesListProps) {
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
      {properties.map((property) => (
        <div
          key={property.id}
          className="bg-white rounded-lg p-4 border border-gray-200 hover:border-emerald-300 transition-colors"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Titlu si cod */}
            <div className="md:col-span-3">
              <Link href={`/properties/${property.id}`}>
                <h3 className="font-semibold text-gray-900 hover:text-emerald-700 cursor-pointer">
                  {property.title}
                </h3>
              </Link>
              <p className="text-xs text-gray-500 mt-1">
                Cod: {property.internal_code}
              </p>
            </div>

            {/* Locatie */}
            <div className="md:col-span-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <MapPin size={16} />
                {property.location}
              </div>
            </div>

            {/* Pret */}
            <div className="md:col-span-2 text-sm font-semibold">
              <div className="flex items-center gap-1 text-gray-900">
                <DollarSign size={16} />
                {property.price.toLocaleString('ro-RO')}
              </div>
            </div>

            {/* Semafor */}
            <div className="md:col-span-1">
              <ActivityStatus daysAgo={getDaysAgo(property.created_at)} />
            </div>

            {/* Badge-uri publicare */}
            <div className="md:col-span-2">
              {property.publications && property.publications.length > 0 ? (
                <PublicationBadges publications={property.publications} />
              ) : (
                <span className="text-xs text-gray-400">Nepublicata</span>
              )}
            </div>

            {/* Butoane actiuni */}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Link
                href={`/properties/${property.id}`}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Detalii
              </Link>
              {canDelete && (
                <button
                  onClick={() => onDelete?.(property.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Sterge"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
