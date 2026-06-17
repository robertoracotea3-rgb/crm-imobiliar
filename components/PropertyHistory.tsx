'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { History, Loader2, Plus, Pencil, Trash2, FileText, RefreshCw } from 'lucide-react';

interface Log {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string | null;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  create:   { label: 'Creată',     icon: <Plus size={13} />,    color: 'text-emerald-600 bg-emerald-50' },
  update:   { label: 'Modificat',  icon: <Pencil size={13} />,  color: 'text-blue-600 bg-blue-50' },
  status:   { label: 'Status',     icon: <RefreshCw size={13} />, color: 'text-purple-600 bg-purple-50' },
  document: { label: 'Document',   icon: <FileText size={13} />, color: 'text-amber-600 bg-amber-50' },
  delete:   { label: 'Ștergere',   icon: <Trash2 size={13} />,  color: 'text-red-600 bg-red-50' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PropertyHistory({ propertyId }: { propertyId: string }) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const t = (await supabase.auth.getSession()).data.session?.access_token;
      if (!t) return;
      const res = await fetch(`/api/properties/history?property_id=${propertyId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await res.json();
      if (d.needsMigration) setNeedsMigration(true);
      setLogs(d.logs || []);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
        <History size={17} className="text-emerald-600" />
        <span className="font-semibold text-gray-800 text-sm flex-1">Istoric modificări</span>
        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{logs.length}</span>
      </div>

      <div className="p-5">
        {needsMigration && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 mb-3">
            Tabela de istoric nu există încă — rulează migrarea SQL în Supabase pentru a activa istoricul.
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Se încarcă...
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Nicio modificare înregistrată încă.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const meta = ACTION_META[log.action] || ACTION_META.update;
              return (
                <div key={log.id} className="flex gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0 pb-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                      {log.field && <span className="text-xs text-gray-500">· {log.field}</span>}
                    </div>
                    {(log.old_value || log.new_value) && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        {log.old_value && <span className="line-through text-gray-400">{log.old_value}</span>}
                        {log.old_value && log.new_value && <span className="mx-1">→</span>}
                        {log.new_value && <span className="font-medium text-gray-800">{log.new_value}</span>}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fmtDate(log.created_at)}{log.user_name ? ` · ${log.user_name}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
