'use client';

import Link from 'next/link';
import { Trash2, MapPin, DollarSign, Target } from 'lucide-react';

interface Demand {
  id: string;
  title: string;
  location: string;
  min_price?: number;
  max_price?: number;
  category: string;
  created_at: string;
  match_count?: number;
}

interface DemandsListProps {
  demands: Demand[];
  onDelete?: (id: string) => void;
  canDelete?: boolean;
}

export function DemandsList({
  demands,
  onDelete,
  canDelete = false,
}: DemandsListProps) {
  if (demands.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">Nu ai cereri inca.</p>
        <button
          className="mt-4 px-6 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: '#0E6B54' }}
        >
          + Adauga cerere
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {demands.map((demand) => (
        <div
          key={demand.id}
          className="bg-white rounded-lg p-4 border border-gray-200 hover:border-emerald-300 transition-colors"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Titlu */}
            <div className="md:col-span-3">
              <h3 className="font-semibold text-gray-900">{demand.title}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Categorie: {demand.category.replace(/_/g, ' ')}
              </p>
            </div>

            {/* Locatie */}
            <div className="md:col-span-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <MapPin size={16} />
                {demand.location}
              </div>
            </div>

            {/* Pret */}
            <div className="md:col-span-2 text-sm">
              <div className="flex items-center gap-1 text-gray-900 font-semibold">
                <DollarSign size={16} />
                {demand.min_price && demand.max_price
                  ? `${demand.min_price.toLocaleString()} - ${demand.max_price.toLocaleString()}`
                  : 'Orice pret'}
              </div>
            </div>

            {/* Potriviri */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 text-emerald-700 font-medium">
                <Target size={18} />
                <span>{demand.match_count || 0} potriviri</span>
              </div>
            </div>

            {/* Actiuni */}
            <div className="md:col-span-3 flex justify-end gap-2">
              <Link
                href={`/matches?demand_id=${demand.id}`}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Vezi potriviri
              </Link>
              {canDelete && (
                <button
                  onClick={() => onDelete?.(demand.id)}
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
