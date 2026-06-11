'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Edit, Trash2, MapPin, DollarSign, Calendar } from 'lucide-react';

interface Property {
  id: string;
  internal_code: string;
  title: string;
  location: string;
  price: number;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProperty();
  }, [params.id]);

  const fetchProperty = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', params.id)
        .single();

      if (fetchError) throw fetchError;
      setProperty(data);
    } catch (err) {
      console.error('Eroare:', err);
      setError('Nu am putut incarca proprietatea');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Se incarca...</p>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 mb-6 text-gray-700 hover:text-gray-900"
        >
          <ChevronLeft size={20} />
          Inapoi
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Proprietate nu gasita'}</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ro-RO');
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
        >
          <ChevronLeft size={20} />
          Inapoi
        </button>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Edit size={18} />
            Editeaza
          </button>
          <button className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-2">
            <Trash2 size={18} />
            Sterge
          </button>
        </div>
      </div>

      {/* Continut */}
      <div className="bg-white rounded-lg p-8 shadow-sm">
        {/* Titlu si cod */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{property.title}</h1>
          <p className="text-gray-600">Cod: {property.internal_code}</p>
        </div>

        {/* Grid info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Stanga */}
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-gray-600">Locatie</label>
              <div className="flex items-center gap-2 text-lg mt-2">
                <MapPin size={20} className="text-emerald-700" />
                {property.location}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Pret</label>
              <div className="flex items-center gap-2 text-2xl font-bold mt-2">
                <DollarSign size={20} className="text-emerald-700" />
                {property.price.toLocaleString('ro-RO')} RON
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Categorie</label>
              <p className="text-lg mt-2 capitalize">{property.category.replace(/_/g, ' ')}</p>
            </div>
          </div>

          {/* Dreapta */}
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-gray-600">Data crearii</label>
              <div className="flex items-center gap-2 text-lg mt-2">
                <Calendar size={20} className="text-emerald-700" />
                {formatDate(property.created_at)}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Ultima actualizare</label>
              <p className="text-lg mt-2">{formatDate(property.updated_at)}</p>
            </div>
          </div>
        </div>

        {/* Descriere */}
        {property.description && (
          <div className="mb-8">
            <label className="text-sm font-medium text-gray-600">Descriere</label>
            <p className="text-gray-700 mt-2 whitespace-pre-wrap">{property.description}</p>
          </div>
        )}

        {/* TODO: Poze, publicari, atribute */}
        <div className="text-gray-500 text-sm border-t border-gray-200 pt-8">
          <p>📸 Poze, 🌍 Publicari, ⚙️ Atribute - vor fi completate in faza urmatoare</p>
        </div>
      </div>
    </div>
  );
}
