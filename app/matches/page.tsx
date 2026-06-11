'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { DemandsList } from '@/components/DemandsList';
import { AddDemandDialog } from '@/components/AddDemandDialog';
import { Plus, Search } from 'lucide-react';

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

export default function MatchesPage() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDemands();
  }, []);

  const fetchDemands = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('demands')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setDemands(data || []);
    } catch (err) {
      console.error('Eroare:', err);
      setError('Nu am putut incarca cereri');
    } finally {
      setLoading(false);
    }
  };

  const filteredDemands = demands.filter(
    (d) =>
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedLayout>
      <div className="p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>
            Cereri & Potriviri
          </h1>
          <button
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#0E6B54' }}
          >
            <Plus size={20} />
            Adauga cerere
          </button>
        </div>

        {/* Filtre */}
        <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cauta dupa titlu sau locatie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Content */}
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
              {filteredDemands.length} cereri
            </p>
            <DemandsList
              demands={filteredDemands}
              canDelete={false}
            />
          </div>
        )}

        <AddDemandDialog
          isOpen={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          onSuccess={() => {
            setIsAddDialogOpen(false);
            fetchDemands();
          }}
        />
      </div>
    </ProtectedLayout>
  );
}
