'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { DemandsList } from '@/components/DemandsList';
import { AddDemandDialog } from '@/components/AddDemandDialog';
import { Plus, Search, Filter } from 'lucide-react';

const CATEGORIES = [
  'apartament', 'casa_vila', 'spatiu_comercial',
  'spatiu_industrial', 'teren', 'pensiune_hotel', 'birou', 'garaj',
];

const SURSE = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'olx', label: 'OLX' },
  { value: 'storia', label: 'Storia' },
  { value: 'imobiliare', label: 'Imobiliare.ro' },
  { value: 'banner', label: 'Banner' },
  { value: 'site_propriu', label: 'Site propriu' },
  { value: 'recomandare', label: 'Recomandare' },
];

export default function MatchesPage() {
  const [demands, setDemands] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSource, setSelectedSource] = useState('');

  useEffect(() => { fetchDemands(); }, []);

  const fetchDemands = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/demands/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDemands(d.demands || []);
    } catch (err) {
      setError('Nu am putut incarca cererile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let list = [...demands];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (d) =>
          d.internal_code?.toLowerCase().includes(q) ||
          d.cities?.some((c: string) => c.toLowerCase().includes(q)) ||
          d.counties?.some((c: string) => c.toLowerCase().includes(q)) ||
          d.notes?.toLowerCase().includes(q) ||
          d.criteria?.notes?.toLowerCase().includes(q)
      );
    }
    if (selectedCategory) {
      list = list.filter((d) => d.category === selectedCategory);
    }
    if (selectedSource) {
      list = list.filter((d) => d.source === selectedSource);
    }
    setFiltered(list);
  }, [searchTerm, selectedCategory, selectedSource, demands]);

  const reset = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedSource('');
  };

  return (
    <ProtectedLayout>
      <div className="p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>
              Cereri & Potriviri
            </h1>
            <p className="text-sm text-gray-500 mt-1">{demands.length} cereri totale</p>
          </div>
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
        <div className="bg-white rounded-lg p-4 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Titlu, oras, judet, observatii..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="">Toate categoriile</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="">Toate sursele</option>
                {SURSE.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={reset}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                title="Reset"
              >
                <Filter size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <p className="text-red-800">{error}</p>
            <button onClick={fetchDemands} className="ml-auto text-sm underline text-red-600">Reîncearcă</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{searchTerm || selectedCategory || selectedSource ? 'Nicio cerere găsită' : 'Nu ai cereri încă'}</p>
            <p className="text-sm text-gray-400 mt-1">Adaugă prima cerere cu butonul de mai sus</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">{filtered.length} cereri</p>
            <DemandsList
              demands={filtered}
              canDelete
              onDelete={async (id) => {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                const res = await fetch(`/api/demands/delete?id=${id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (res.ok) setDemands(prev => prev.filter(d => d.id !== id));
              }}
            />
          </div>
        )}

        <AddDemandDialog
          isOpen={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          onSuccess={() => { setIsAddDialogOpen(false); fetchDemands(); }}
        />
      </div>
    </ProtectedLayout>
  );
}
