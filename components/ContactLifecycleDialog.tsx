'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArchiveRestore, Loader2, X } from 'lucide-react';

import {
  CONTACT_LIFECYCLE,
  contactLifecycleMeta,
  type ContactLifecycleStatus,
} from '@/lib/contact-lifecycle';
import { supabase } from '@/lib/supabase';

type Props = {
  contactId: string;
  contactName: string;
  currentStatus?: string | null;
  canArchive?: boolean;
  onClose: () => void;
  onSaved: (status: ContactLifecycleStatus) => void;
};

export function ContactLifecycleDialog({
  contactId,
  contactName,
  currentStatus,
  canArchive = false,
  onClose,
  onSaved,
}: Props) {
  const current = contactLifecycleMeta(currentStatus);
  const options = useMemo(
    () => CONTACT_LIFECYCLE.filter((status) => (
      status.code !== current.code
      && (status.code !== 'arhivat' || canArchive)
    )),
    [canArchive, current.code],
  );
  const [target, setTarget] = useState<ContactLifecycleStatus>(
    options[0]?.code || current.code,
  );
  const [reason, setReason] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (target === 'arhivat' && reason.trim().length < 5) {
      setError('Scrie motivul arhivării, cu cel puțin 5 caractere.');
      return;
    }
    setSaving(true);
    setError('');
    setBlockers([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/contacts/lifecycle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          contact_id: contactId,
          to_status: target,
          reason: reason.trim() || null,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setBlockers(Array.isArray(data.blockers) ? data.blockers : []);
        throw new Error(data.error || 'Starea nu a putut fi schimbată.');
      }
      onSaved(target);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Starea nu a putut fi schimbată.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="mobile-dialog-panel w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">Schimbă starea clientului</h2>
            <p className="mt-1 text-sm text-gray-500">{contactName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Închide">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
            Starea actuală: <span className={`ml-1 rounded-full px-2 py-1 text-xs font-semibold ${current.color}`}>{current.label}</span>
          </div>

          <label className="block text-sm font-medium text-gray-800">
            Starea nouă
            <select
              value={target}
              onChange={(event) => {
                setTarget(event.target.value as ContactLifecycleStatus);
                setError('');
                setBlockers([]);
              }}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {options.map((status) => (
                <option key={status.code} value={status.code}>{status.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-800">
            {target === 'arhivat' ? 'Motivul arhivării (obligatoriu)' : 'Motiv sau observație'}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder={target === 'arhivat'
                ? 'Ex.: Clientul nu mai caută, toate cererile sunt închise.'
                : 'De ce se schimbă starea?'}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {target === 'client_vechi' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Sistemul verifică automat contactul reușit, lipsa leadurilor noi, a cererilor,
              vizionărilor, taskurilor și tranzacțiilor active, plus minimum 60 de zile fără activitate.
            </p>
          )}
          {target === 'arhivat' && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              Arhivarea nu șterge datele. Este permisă numai fără cereri, tranzacții,
              vizionări sau taskuri active. Un lead nou va reactiva automat clientul.
            </p>
          )}

          {blockers.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={17} /> Mai întâi rezolvă:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
            Renunță
          </button>
          <button
            onClick={save}
            disabled={saving || target === current.code}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ArchiveRestore size={16} />}
            Salvează starea
          </button>
        </div>
      </div>
    </div>
  );
}
