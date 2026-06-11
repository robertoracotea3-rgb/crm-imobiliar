'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PropertiesList } from '@/components/PropertiesList';
import { AddPropertyDialog } from '@/components/AddPropertyDialog';
import { Search, Filter, Plus, Wand2 } from 'lucide-react';

const CATEGORIES = [
  'apartament',
  'casa_vila',
  'spatiu_comercial',
  'spatiu_industrial',
  'teren',
  'pensiune_hotel',
  'birou',
  'garaj',
];

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Mock data daca nu sunt proprietati
      if (!data || data.length === 0) {
        setProperties([]);
        setFilteredProperties([]);
        return;
      }

      setProperties(data);
      setFilteredProperties(data);
    } catch (err) {
      console.error('Eroare la fetch proprietati:', err);
      setError('Nu am putut incarca proprietatile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = properties;

    if (searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.internal_code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    setFilteredProperties(filtered);
  }, [searchTerm, selectedCategory, properties]);

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>
          Proprietati
        </h1>
        <div className="flex gap-2">
          <Link
            href="/properties/ai-assistant"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#B57514' }}
          >
            <Wand2 size={20} />
            Asistent AI
          </Link>
          <button
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#0E6B54' }}
          >
            <Plus size={20} />
            Adauga proprietate
          </button>
        </div>
      </div>

      {/* Filtre */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cauta dupa titlu sau cod..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Categorie */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Toate categoriile</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Reset */}
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('');
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Se incarca...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            {filteredProperties.length} proprietat{filteredProperties.length !== 1 ? 'i' : 'e'}
          </p>
          <PropertiesList
            properties={filteredProperties}
            canDelete={false}
          />
        </div>
      )}

      <AddPropertyDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={() => {
          setIsAddDialogOpen(false);
          fetchProperties();
        }}
      />
    </div>
  );
}
