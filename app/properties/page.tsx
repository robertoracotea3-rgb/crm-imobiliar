'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PropertiesList } from '@/components/PropertiesList';
import { PropertiesMapView } from '@/components/PropertiesMapView';
import { AddPropertyDialog } from '@/components/AddPropertyDialog';
import { Search, Filter, Plus, Wand2, ArrowUpDown, CheckSquare, Trash2, RefreshCw, User, Globe } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { JUDETE, ORASE_BY_JUDET } from '@/lib/romania-locations';

const CATEGORIES = [
  'apartament', 'casa_vila', 'spatiu_comercial', 'spatiu_industrial',
  'teren', 'pensiune_hotel', 'birou', 'garaj',
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Cel mai nou' },
  { value: 'oldest', label: 'Cel mai vechi' },
  { value: 'price_asc', label: 'Pret ↑' },
  { value: 'price_desc', label: 'Pret ↓' },
];

const STATUS_LABEL: Record<string, string> = {
  activa: 'Activa', rezervata: 'Rezervata', tranzactionata: 'Tranzactionata',
  inchiriata: 'Inchiriata', retrasa: 'Retrasa', expirata: 'Expirata',
  draft: 'Draft', arhivata: 'Arhivata',
};

const STATUS_COLOR: Record<string, string> = {
  activa: 'bg-emerald-100 text-emerald-800', rezervata: 'bg-blue-100 text-blue-800',
  tranzactionata: 'bg-purple-100 text-purple-800', inchiriata: 'bg-indigo-100 text-indigo-800',
  retrasa: 'bg-gray-100 text-gray-600', expirata: 'bg-orange-100 text-orange-700',
  draft: 'bg-yellow-100 text-yellow-800', arhivata: 'bg-red-100 text-red-700',
};

const BULK_STATUSES = [
  { value: 'activa', label: 'Activă' },
  { value: 'rezervata', label: 'Rezervată' },
  { value: 'retrasa', label: 'Retrasă' },
  { value: 'tranzactionata', label: 'Tranzacționată' },
  { value: 'arhivata', label: 'Arhivată' },
];

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showActive, setShowActive] = useState(true);
  const [showReservate, setShowReservate] = useState(false);
  const [showTranzactionate, setShowTranzactionate] = useState(false);
  const [showRetrase, setShowRetrase] = useState(false);
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  // Căutare AI
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any[] | null>(null);
  const [aiFilters, setAiFilters] = useState<Record<string, any> | null>(null);
  const [aiError, setAiError] = useState('');

  const runAiSearch = async () => {
    if (!aiQuery.trim()) return;
    try {
      setAiLoading(true); setAiError('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAiError('Sesiune expirată'); return; }
      const res = await fetch('/api/properties/ai-search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare căutare AI');
      setAiResults(d.properties || []);
      setAiFilters(d.filters || {});
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiSearch = () => { setAiResults(null); setAiFilters(null); setAiQuery(''); setAiError(''); };

  // Filtre noi
  const [selectedCounty, setSelectedCounty] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkAgent, setBulkAgent] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const availableCities = selectedCounty ? (ORASE_BY_JUDET[selectedCounty] || []) : [];

  useEffect(() => {
    fetchProperties();
    fetchAgents();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Nu esti autentificat'); return; }

      const res = await fetch('/api/properties/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setProperties(d.properties || []);
    } catch (err) {
      console.error('Eroare la fetch proprietati:', err);
      setError('Nu am putut incarca proprietatile');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/agents/list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      const list = (d.agents || []).map((a: { id: string; email: string }) => ({ id: a.id, name: a.email }));
      setAgentsList(list);
    } catch {}
  };

  useEffect(() => {
    let filtered = [...properties];

    // Status filter — fiecare buton/bifă e un grup de statusuri. Arătăm uniunea celor selectate.
    // Dacă nu e nimic selectat, arătăm tot (ca să nu rămână lista goală).
    const allowedStatuses: string[] = [];
    if (showActive) allowedStatuses.push('activa');
    if (showReservate) allowedStatuses.push('rezervata');
    if (showTranzactionate) allowedStatuses.push('tranzactionata', 'tranzactionata', 'inchiriata', 'inchiriata');
    if (showRetrase) allowedStatuses.push('retrasa', 'expirata', 'arhivata');
    if (allowedStatuses.length > 0) {
      filtered = filtered.filter((p) => allowedStatuses.includes(p.status || 'activa'));
    }

    // Text search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.internal_code?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.county?.toLowerCase().includes(q) ||
          p.attributes?.location_text?.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (selectedCategory) filtered = filtered.filter((p) => p.category === selectedCategory);

    // County filter
    if (selectedCounty) {
      filtered = filtered.filter((p) =>
        p.county?.toLowerCase() === selectedCounty.toLowerCase() ||
        p.attributes?.judet?.toLowerCase() === selectedCounty.toLowerCase()
      );
    }

    // City filter
    if (selectedCity) {
      filtered = filtered.filter((p) =>
        p.city?.toLowerCase() === selectedCity.toLowerCase() ||
        p.attributes?.localitate?.toLowerCase() === selectedCity.toLowerCase()
      );
    }

    // Transaction type filter
    if (selectedTransaction) {
      filtered = filtered.filter((p) => {
        const tip = p.attributes?.tip_oferta || '';
        if (selectedTransaction === 'vanzare') return tip === 'Vânzare';
        if (selectedTransaction === 'inchiriere') return tip === 'Închiriere';
        return true;
      });
    }

    // Agent filter
    if (selectedAgent) filtered = filtered.filter((p) => p.agent_id === selectedAgent);

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'price_asc') return (a.price ?? 0) - (b.price ?? 0);
      if (sortBy === 'price_desc') return (b.price ?? 0) - (a.price ?? 0);
      return 0;
    });

    setFilteredProperties(filtered);
    // Clear selections when filters change
    setSelectedIds(new Set());
  }, [searchTerm, selectedCategory, sortBy, showActive, showReservate, showTranzactionate, showRetrase,
      selectedCounty, selectedCity, selectedTransaction, selectedAgent, properties]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSortBy('newest');
    setShowActive(true);
    setShowReservate(false);
    setShowTranzactionate(false);
    setShowRetrase(false);
    setSelectedCounty('');
    setSelectedCity('');
    setSelectedTransaction('');
    setSelectedAgent('');
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProperties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProperties.map(p => p.id)));
    }
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch('/api/properties/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ id, status: bulkStatus }),
          })
        )
      );
      setSelectedIds(new Set());
      setBulkStatus('');
      await fetchProperties();
    } catch (err) {
      console.error('Eroare bulk status:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Mută proprietățile selectate pe alt agent
  const applyBulkAgent = async () => {
    if (selectedIds.size === 0 || !bulkAgent) return; // trebuie aleasă o opțiune (agent sau „neasignat")
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const agentId = bulkAgent === '__none__' ? null : bulkAgent;
      const res = await fetch('/api/properties/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), agent_id: agentId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Eroare la mutarea pe agent'); return; }
      setSelectedIds(new Set());
      setBulkAgent('');
      await fetchProperties();
    } catch (err) {
      console.error('Eroare bulk agent:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Publică/retrage pe site proprietățile selectate
  const applyBulkPublish = async (publish: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/properties/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), publishSite: publish, unpublishSite: !publish }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Eroare la publicare'); return; }
      setSelectedIds(new Set());
      await fetchProperties();
    } catch (err) {
      console.error('Eroare bulk publish:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const applyBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Ștergi ${selectedIds.size} proprietăți? Acțiunea este ireversibilă.`)) return;
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/properties/delete?id=${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        )
      );
      setSelectedIds(new Set());
      await fetchProperties();
    } catch (err) {
      console.error('Eroare bulk delete:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const activeCount = properties.filter((p) => (p.status || 'activa') === 'activa').length;
  const rezervateCount = properties.filter((p) => p.status === 'rezervata').length;
  const tranzactionateCount = properties.filter((p) => ['tranzactionata', 'tranzactionata', 'inchiriata', 'inchiriata'].includes(p.status)).length;
  const retraseCount = properties.filter((p) => ['retrasa', 'expirata', 'arhivata'].includes(p.status)).length;

  return (
    <ProtectedLayout module="properties">
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>
            Proprietati
          </h1>
          <div className="flex gap-3 mt-2">
            <span className="text-xs font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
            {rezervateCount > 0 && (
              <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                {rezervateCount} rezervate
              </span>
            )}
            {tranzactionateCount > 0 && (
              <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                {tranzactionateCount} tranzactionate
              </span>
            )}
            {retraseCount > 0 && (
              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {retraseCount} retrase
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Toggle Listă / Hartă */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              Listă
            </button>
            <button onClick={() => setView('map')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'map' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              Hartă
            </button>
          </div>
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

      {/* Căutare AI */}
      <div className="bg-gradient-to-r from-amber-50 to-white border border-amber-200 rounded-xl p-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Wand2 size={18} className="text-amber-600 flex-shrink-0" />
            <input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runAiSearch(); }}
              placeholder='Caută în limbaj natural: "apartamente 3 camere Făgăraș sub 70000 euro"'
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap flex-1 sm:flex-none"
              style={{ backgroundColor: '#B57514' }}>
              {aiLoading ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
              Caută cu AI
            </button>
            {aiResults !== null && (
              <button onClick={clearAiSearch} className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">Resetează</button>
            )}
          </div>
        </div>
        {aiError && <p className="text-xs text-red-600 mt-2">{aiError}</p>}
        {aiResults !== null && aiFilters && (
          <div className="flex items-center gap-2 flex-wrap mt-3 text-xs">
            <span className="text-gray-500">AI a găsit <b>{aiResults.length}</b> rezultate ·</span>
            {Object.entries(aiFilters).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
              <span key={k} className="bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{k}: {String(v)}</span>
            ))}
          </div>
        )}
      </div>

      {/* Filtre */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm space-y-4">
        {/* Rand 1: search + categorie + sortare */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Titlu, cod, oras, judet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Toate categoriile</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-3 text-gray-400" size={16} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm appearance-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Rand 2: judet + localitate + tip oferta + agent */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-gray-100">
          <select
            value={selectedCounty}
            onChange={(e) => { setSelectedCounty(e.target.value); setSelectedCity(''); }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Toate județele</option>
            {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            disabled={!selectedCounty}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Toate localitățile</option>
            {availableCities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedTransaction}
            onChange={(e) => setSelectedTransaction(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Vânzare + Închiriere</option>
            <option value="vanzare">Vânzare</option>
            <option value="inchiriere">Închiriere</option>
          </select>

          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Toți agenții</option>
            {agentsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Rand 3: status checkboxes + reset */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status:</span>

          <button
            type="button"
            onClick={() => setShowActive(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              showActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${showActive ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
            Active{activeCount > 0 && <span className={`ml-1 ${showActive ? 'text-emerald-600' : 'text-gray-400'}`}>({activeCount})</span>}
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showReservate} onChange={(e) => setShowReservate(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-xs font-medium text-gray-700">Rezervate{rezervateCount > 0 && <span className="ml-1 text-blue-600">({rezervateCount})</span>}</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showTranzactionate} onChange={(e) => setShowTranzactionate(e.target.checked)} className="w-4 h-4 rounded accent-purple-600" />
            <span className="text-xs font-medium text-gray-700">Tranzactionate{tranzactionateCount > 0 && <span className="ml-1 text-purple-600">({tranzactionateCount})</span>}</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showRetrase} onChange={(e) => setShowRetrase(e.target.checked)} className="w-4 h-4 rounded accent-gray-500" />
            <span className="text-xs font-medium text-gray-700">Retrase{retraseCount > 0 && <span className="ml-1 text-gray-500">({retraseCount})</span>}</span>
          </label>

          <button
            onClick={resetFilters}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            <Filter size={13} />
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
      ) : view === 'map' ? (
        <PropertiesMapView properties={aiResults ?? filteredProperties} />
      ) : (
        <div>
          {/* Header lista cu selectie bulk */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredProperties.length > 0 && selectedIds.size === filteredProperties.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                <span className="text-xs text-gray-500">Selectează toate</span>
              </label>
              <p className="text-sm text-gray-600">
                {filteredProperties.length} proprietat{filteredProperties.length !== 1 ? 'i' : 'e'}
                {selectedIds.size > 0 && <span className="ml-1 font-semibold text-emerald-700">({selectedIds.size} selectate)</span>}
              </p>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <CheckSquare size={16} className="text-emerald-700 flex-shrink-0" />
              <span className="text-sm font-semibold text-emerald-800">{selectedIds.size} selectate</span>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">Schimbă status...</option>
                  {BULK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button
                  onClick={applyBulkStatus}
                  disabled={!bulkStatus || bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-40 hover:opacity-90 transition-colors"
                  style={{ backgroundColor: '#0E6B54' }}
                >
                  <RefreshCw size={13} />
                  Aplică
                </button>

                {/* Mută pe alt agent */}
                <select
                  value={bulkAgent}
                  onChange={(e) => setBulkAgent(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Mută pe agent...</option>
                  <option value="__none__">— Neasignat —</option>
                  {agentsList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  onClick={applyBulkAgent}
                  disabled={!bulkAgent || bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                >
                  <User size={13} />
                  Mută agent
                </button>

                {/* Publicare pe site */}
                <button
                  onClick={() => applyBulkPublish(true)}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  <Globe size={13} />
                  Publică pe site
                </button>
                <button
                  onClick={() => applyBulkPublish(false)}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition-colors"
                >
                  Retrage
                </button>

                <button
                  onClick={applyBulkDelete}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  Șterge
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Anulează
                </button>
              </div>
            </div>
          )}

          <PropertiesList
            properties={aiResults ?? filteredProperties}
            statusColorMap={STATUS_COLOR}
            statusLabelMap={STATUS_LABEL}
            canDelete={false}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            agentNames={Object.fromEntries(agentsList.map((a) => [a.id, a.name]))}
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
    </ProtectedLayout>
  );
}
