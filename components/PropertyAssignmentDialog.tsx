'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, UserRoundCheck, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';

type Agent = { id: string; name: string };

export function PropertyAssignmentDialog({
  propertyIds,
  agents,
  initialAgentId = '',
  onClose,
  onSaved,
}: {
  propertyIds: string[];
  agents: Agent[];
  initialAgentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [agentId, setAgentId] = useState(initialAgentId);
  const [reason, setReason] = useState('');
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [options, setOptions] = useState({
    reassign_active_leads: true,
    reassign_open_tasks: true,
    reassign_future_viewings: true,
    reassign_active_demands: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === agentId)?.name || 'fără agent',
    [agentId, agents],
  );

  const submit = async () => {
    if (!agentId && !allowUnassigned) {
      setError('Selectează un agent sau marchează explicit excepția.');
      return;
    }
    if (!reason.trim()) {
      setError('Scrie motivul alocării sau realocării.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/properties/assign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_ids: propertyIds,
          responsible_agent_id: agentId || null,
          reason,
          options: {
            ...options,
            allow_unassigned_exception: allowUnassigned && !agentId,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Alocarea nu a putut fi salvată.');
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Alocarea nu a putut fi salvată.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="mobile-dialog-panel w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="text-indigo-600" size={20} />
            <h2 className="font-bold text-gray-900">
              {propertyIds.length === 1 ? 'Alocă proprietatea' : `Alocă ${propertyIds.length} proprietăți`}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Agent responsabil</label>
            <select
              value={agentId}
              onChange={(event) => {
                setAgentId(event.target.value);
                if (event.target.value) setAllowUnassigned(false);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Selectează agentul —</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Motiv *</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex.: zonă de lucru, disponibilitate, realocare aprobată..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3">
            <legend className="px-1 text-xs font-semibold text-gray-600">Ce se realocă împreună</legend>
            {[
              ['reassign_active_leads', 'Leadurile active pentru proprietate'],
              ['reassign_open_tasks', 'Taskurile nefinalizate'],
              ['reassign_future_viewings', 'Vizionările viitoare'],
              ['reassign_active_demands', 'Cererile active potrivite proprietății'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={options[key as keyof typeof options]}
                  onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4 accent-indigo-600"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={allowUnassigned}
              disabled={Boolean(agentId)}
              onChange={(event) => setAllowUnassigned(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
            <span>
              Permit temporar fără agent ca excepție documentată. Proprietatea va fi evidențiată ownerului.
            </span>
          </label>

          <div className="flex gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <p>
              Confirmi alocarea către <strong>{selectedAgent}</strong>. Agentul anterior rămâne în istoric,
              iar numai elementele bifate mai sus vor fi mutate.
            </p>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
            Anulează
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Se salvează...' : 'Confirmă alocarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
