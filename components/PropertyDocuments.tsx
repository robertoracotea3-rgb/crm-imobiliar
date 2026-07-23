'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Upload, Trash2, Download, Eye, Loader2, FolderOpen } from 'lucide-react';

interface Doc {
  id: string;
  category: string;
  file_name: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
  url: string | null;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'contract', label: 'Contract' },
  { key: 'extras_cf', label: 'Extras CF' },
  { key: 'cert_energetic', label: 'Certificat energetic' },
  { key: 'act_proprietar', label: 'Act identitate proprietar' },
  { key: 'altele', label: 'Alte documente' },
];

const fmtSize = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(2)} MB` : '');

export function PropertyDocuments({ propertyId }: { propertyId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const fetchDocs = useCallback(async () => {
    try {
      const t = await token();
      if (!t) return;
      const res = await fetch(`/api/properties/documents?property_id=${propertyId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await res.json();
      if (d.needsMigration) setNeedsMigration(true);
      setDocs(d.documents || []);
    } catch {
      setError('Nu am putut încărca documentele');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchDocs(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchDocs]);

  const handleUpload = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingCat(category);
    try {
      const t = await token();
      if (!t) throw new Error('Sesiune expirată');
      const form = new FormData();
      form.append('property_id', propertyId);
      form.append('category', category);
      form.append('file', file);
      const res = await fetch('/api/properties/documents', {
        method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare la upload');
      setDocs(prev => [d.document, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la upload');
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Ștergi acest document?')) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/properties/documents?id=${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
        <FileText size={17} className="text-emerald-600" />
        <span className="font-semibold text-gray-800 text-sm flex-1">Documente</span>
        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{docs.length}</span>
      </div>

      <div className="p-5 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-sm text-red-800">{error}</div>}
        {needsMigration && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
            Tabela de documente nu există încă — rulează migrarea SQL în Supabase pentru a activa documentele.
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
            <Loader2 size={14} className="animate-spin" /> Se încarcă...
          </div>
        ) : (
          CATEGORIES.map(cat => {
            const catDocs = docs.filter(d => d.category === cat.key);
            return (
              <div key={cat.key} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <FolderOpen size={14} className="text-gray-400" /> {cat.label}
                    {catDocs.length > 0 && <span className="text-xs text-gray-400">({catDocs.length})</span>}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    ref={el => { fileRefs.current[cat.key] = el; }}
                    onChange={e => handleUpload(cat.key, e)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRefs.current[cat.key]?.click()}
                    disabled={uploadingCat === cat.key}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg disabled:opacity-50"
                  >
                    {uploadingCat === cat.key ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Încarcă
                  </button>
                </div>

                {catDocs.length === 0 ? (
                  <p className="text-xs text-gray-300">Niciun document</p>
                ) : (
                  <div className="space-y-1.5">
                    {catDocs.map(d => (
                      <div key={d.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <FileText size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-700 truncate flex-1">{d.file_name}</span>
                        <span className="text-[10px] text-gray-400">{fmtSize(d.size)}</span>
                        {d.url && (
                          <>
                            <a href={d.url} target="_blank" rel="noopener noreferrer" title="Vizualizează"
                              className="p-1 text-gray-500 hover:text-emerald-600"><Eye size={13} /></a>
                            <a href={d.url} download={d.file_name} title="Descarcă"
                              className="p-1 text-gray-500 hover:text-emerald-600"><Download size={13} /></a>
                          </>
                        )}
                        <button onClick={() => handleDelete(d.id)} title="Șterge"
                          className="p-1 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
