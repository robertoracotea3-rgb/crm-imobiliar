'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, User, Building2, Shield, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';

const ic = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900';
const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietar', admin: 'Administrator', manager: 'Manager',
  agent_senior: 'Agent Senior', agent: 'Agent', assistant: 'Asistent',
};

interface SettingsData {
  agency: { id: string; name: string; created_at: string } | null;
  profile: { full_name: string; email: string; role: string; phone: string; job_title: string };
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [copied, setCopied] = useState(false);

  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', job_title: '' });
  const [agencyForm, setAgencyForm] = useState({ agency_name: '' });
  const [activeTab, setActiveTab] = useState<'profile' | 'agency' | 'security'>('profile');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoadError('Sesiune expirată'); return; }
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (signal?.aborted) return;
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
      setProfileForm({ full_name: d.profile.full_name || '', phone: d.profile.phone || '', job_title: d.profile.job_title || '' });
      setAgencyForm({ agency_name: d.agency?.name || '' });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setLoadError('Nu am putut încărca setările');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const handleSave = async (patch: Record<string, string>) => {
    setSaving(true); setSaveErr(''); setSaveOk(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  const copyFeedUrl = () => {
    if (!data?.agency) return;
    const feedUrl = `${window.location.origin}/api/feed/properties.xml?agency_id=${data.agency.id}`;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'profile', label: 'Profil', icon: User },
    { id: 'agency', label: 'Agenție', icon: Building2 },
    { id: 'security', label: 'Securitate', icon: Shield },
  ] as const;

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings size={26} style={{ color: '#0E6B54' }} />
          <h1 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>Setări</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="text-red-700 text-sm">{loadError}</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
              {tabs.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    <Icon size={16} />{t.label}
                  </button>
                );
              })}
            </div>

            {/* Save feedback */}
            {saveOk && (
              <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                <CheckCircle size={16} /> Salvat cu succes
              </div>
            )}
            {saveErr && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle size={16} /> {saveErr}
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">Informații personale</h2>
                {data?.profile && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                    <p className="text-gray-500">Email: <span className="text-gray-900 font-medium">{data.profile.email}</span></p>
                    <p className="text-gray-500 mt-1">Rol: <span className="text-gray-900 font-medium">{ROLE_LABEL[data.profile.role] || data.profile.role}</span></p>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nume complet</label>
                    <input type="text" value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))} className={ic} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
                    <input type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} className={ic} placeholder="07xx xxx xxx" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Funcție / Titlu</label>
                    <input type="text" value={profileForm.job_title} onChange={e => setProfileForm(p => ({ ...p, job_title: e.target.value }))} className={ic} placeholder="Agent imobiliar" />
                  </div>
                  <button onClick={() => handleSave(profileForm)} disabled={saving}
                    className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                    style={{ backgroundColor: '#0E6B54' }}>
                    {saving ? 'Se salvează...' : 'Salvează profilul'}
                  </button>
                </div>
              </div>
            )}

            {/* Agency Tab */}
            {activeTab === 'agency' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Informații agenție</h2>
                  {data?.agency && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <p className="text-gray-500">ID: <span className="text-gray-900 font-mono text-xs">{data.agency.id}</span></p>
                      <p className="text-gray-500 mt-1">Creat la: <span className="text-gray-900">{new Date(data.agency.created_at).toLocaleDateString('ro-RO')}</span></p>
                    </div>
                  )}
                  {['owner', 'admin'].includes(data?.profile.role || '') && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nume agenție</label>
                        <input type="text" value={agencyForm.agency_name} onChange={e => setAgencyForm({ agency_name: e.target.value })} className={ic} />
                      </div>
                      <button onClick={() => handleSave(agencyForm)} disabled={saving}
                        className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                        style={{ backgroundColor: '#0E6B54' }}>
                        {saving ? 'Se salvează...' : 'Salvează agenția'}
                      </button>
                    </div>
                  )}
                </div>

                {/* XML Feed */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-semibold text-gray-800 mb-2">Feed XML proprietăți</h2>
                  <p className="text-sm text-gray-500 mb-4">Exportă proprietățile active în format XML pentru portale externe.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg overflow-auto">
                      {data?.agency ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/feed/properties.xml?agency_id=${data.agency.id}` : '...'}
                    </code>
                    <button onClick={copyFeedUrl}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
                      {copied ? <><CheckCircle size={14} className="text-emerald-600" /> Copiat</> : <><Copy size={14} /> Copiază</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">Securitate cont</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">Schimbă parola</p>
                      <p className="text-xs text-gray-500 mt-0.5">Trimite un email de resetare la adresa ta</p>
                    </div>
                    <button onClick={async () => {
                      if (!data?.profile.email) return;
                      await supabase.auth.resetPasswordForEmail(data.profile.email);
                      alert('Email de resetare trimis!');
                    }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                      Resetează parola
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div>
                      <p className="font-medium text-amber-800 text-sm">Sesiuni active</p>
                      <p className="text-xs text-amber-600 mt-0.5">Deconectează-te de pe toate dispozitivele</p>
                    </div>
                    <button onClick={async () => {
                      await supabase.auth.signOut({ scope: 'global' });
                      window.location.href = '/login';
                    }}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
                      Deconectare globală
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedLayout>
  );
}
