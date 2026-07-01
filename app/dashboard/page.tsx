'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  Home, TrendingUp, TrendingDown, Users, Target, Bell, Zap,
  AlertTriangle, CheckCircle, Eye, ArrowRight, Building2, Phone,
  Star, Award, ChevronRight, RefreshCw, Image, FileText, DollarSign,
  Activity, MessageSquare, Search, Calendar, Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface DashData {
  user: { name: string; role: string };
  properties: {
    total: number; active: number; sold: number; rented: number; withdrawn: number;
    this_month: number; last_month: number; this_week: number;
    no_photos: number; no_description: number; total_value: number;
    by_category: { category: string; count: number }[];
    by_month: { month: string; count: number }[];
    sold_by_month: { month: string; count: number }[];
    recent: { id: string; internal_code: string; title: string; status: string; category: string; city: string; price: number; currency: string; created_at: string }[];
    quality_alerts: { type: string; id: string; code: string; title: string; message: string; severity: string }[];
  };
  contacts: { total: number; this_month: number; last_month: number; by_month: { month: string; count: number }[] };
  clients: {
    total: number; noi: number; resunat: number; retrasi: number; won: number; lost: number;
    today: number; this_week: number; this_month: number; last_month: number;
    without_agent: number; old_uncontacted: number; by_source: { source: string; count: number }[];
  };
  team: { total: number; leaderboard: { user_id: string; name: string; role: string; active: number; sold: number; clients: number; activities: number; score: number }[] };
  activities: {
    total: number; today: number; completed_today: number; overdue: number; upcoming: number; pending: number;
    by_type: { type: string; count: number }[];
  };
  tasks?: { open: number; overdue: number; due_soon: number; high_priority: number };
  notifications: { type: string; message: string; created_at: string; severity: string }[];
  activity: { type: string; id: string; code: string; label: string; sub: string; created_at: string }[];
  months: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  apartament: 'Apartament', casa_vila: 'Casă/Vilă', spatiu_comercial: 'Comercial',
  spatiu_industrial: 'Industrial', teren: 'Teren', pensiune_hotel: 'Hotel',
  birou: 'Birou', garaj: 'Garaj',
};
const CAT_COLORS = ['#0E6B54','#1a9070','#34c28e','#60d6b0','#93e4cc','#b8eedf','#d4f5ec','#e8faf5'];
const MONTH_ABBR = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(m: string) {
  const [, mon] = m.split('-');
  return MONTH_ABBR[parseInt(mon, 10) - 1] || m;
}

function trendColor(current: number, prev: number) {
  if (prev === 0) return 'text-gray-400';
  return current >= prev ? 'text-emerald-600' : 'text-red-500';
}

function trendPct(current: number, prev: number) {
  if (prev === 0) return current > 0 ? '+100%' : '0%';
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatVal(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function relativeTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}z`;
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data, color = '#0E6B54', height = 120 }: { data: { month: string; count: number }[]; color?: string; height?: number }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 100 / data.length;
  return (
    <svg viewBox={`0 0 ${data.length * 24} ${height + 24}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.count / max) * height;
        const x = i * 24 + 2;
        const y = height - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={20} height={barH}
              rx={3} fill={isLast ? color : `${color}70`}
              className="transition-all duration-300" />
            {d.count > 0 && (
              <text x={x + 10} y={y - 4} textAnchor="middle" fontSize={7} fill="#6b7280">{d.count}</text>
            )}
            <text x={x + 10} y={height + 16} textAnchor="middle" fontSize={7} fill={isLast ? color : '#9ca3af'}>
              {monthLabel(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 40, cx = 50, cy = 50, stroke = 14;
  let offset = 0;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-[140px]">
      {data.map((d, i) => {
        const pct = d.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const rotation = offset * 360 - 90;
        offset += pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            className="transition-all duration-500" />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#111827">{total}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={7} fill="#6b7280">total</text>
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, prev, color, sub, mini }: {
  icon: React.ReactNode; label: string; value: number | string; prev?: number; color: string; sub?: string; mini?: boolean;
}) {
  const numVal = typeof value === 'number' ? value : 0;
  const showTrend = prev !== undefined && typeof value === 'number';
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 ${mini ? 'p-4' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
        {showTrend && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor(numVal, prev!)}`}>
            {numVal >= prev! ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trendPct(numVal, prev!)}
          </span>
        )}
      </div>
      <p className="text-3xl font-black text-gray-900 leading-none mb-1">
        {typeof value === 'number' ? formatVal(value) : value}
      </p>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-emerald-600">{icon}</span>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sesiune expirată'); return; }
      const res = await fetch('/api/dashboard/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (signal?.aborted) return;
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
      setLastRefresh(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { load(); }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara';
  const dayName = now.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="p-6 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-gray-100 rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-gray-100 rounded-2xl" />)}
            </div>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  if (error) {
    return (
      <ProtectedLayout>
        <div className="p-6 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={refresh} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#0E6B54' }}>
            Încearcă din nou
          </button>
        </div>
      </ProtectedLayout>
    );
  }

  if (!data) return null;

  const { properties: p, contacts, clients, team, activities, notifications, activity } = data;

  const donutData = p.by_category.map((c, i) => ({
    label: CAT_LABELS[c.category] || c.category,
    value: c.count,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));

  const notifBg: Record<string, string> = {
    success: 'bg-emerald-50 border-emerald-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
    alert: 'bg-red-50 border-red-200',
  };
  const notifIcon: Record<string, React.ReactNode> = {
    success: <CheckCircle size={14} className="text-emerald-600" />,
    warning: <AlertTriangle size={14} className="text-amber-600" />,
    info: <Bell size={14} className="text-blue-600" />,
    alert: <AlertTriangle size={14} className="text-red-600" />,
    client: <MessageSquare size={14} className="text-purple-600" />,
  };

  const actIcon: Record<string, React.ReactNode> = {
    property: <Home size={14} className="text-emerald-600" />,
    contact: <Users size={14} className="text-purple-600" />,
    client: <MessageSquare size={14} className="text-orange-500" />,
  };

  return (
    <ProtectedLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Welcome Banner ── */}
        <div className="rounded-2xl p-5 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0E6B54 0%, #1a9070 60%, #22c68a 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <p className="text-emerald-100 text-sm capitalize">{dayName}</p>
              <h1 className="text-2xl md:text-3xl font-black mt-1">
                {greeting}{data.user.name ? `, ${data.user.name.split(' ')[0]}!` : '!'}
              </h1>
              <p className="text-emerald-100 text-sm mt-1">
                {p.active} proprietăți active · {p.this_week} adăugate această săptămână
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-xl px-4 py-3 text-center min-w-[90px]">
                <p className="text-2xl font-black">{p.active}</p>
                <p className="text-xs text-emerald-100">Active</p>
              </div>
              <div className="bg-white/20 rounded-xl px-4 py-3 text-center min-w-[90px]">
                <p className="text-2xl font-black">{clients.noi}</p>
                <p className="text-xs text-emerald-100">Clienți noi</p>
              </div>
              <button onClick={refresh} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors" title="Reîmprospătează">
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI Row 1 ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <KpiCard icon={<Home size={20} className="text-emerald-600" />} label="Proprietăți active" value={p.active} prev={p.last_month} color="bg-emerald-50" sub={`${p.this_month} luna aceasta`} />
          <KpiCard icon={<CheckCircle size={20} className="text-blue-600" />} label="Tranzacționate" value={p.sold} color="bg-blue-50" sub="toate timpurile" />
          <KpiCard icon={<Target size={20} className="text-purple-600" />} label="Clienți NOI" value={clients.noi} prev={clients.last_month} color="bg-purple-50" sub={`${clients.this_month} luna aceasta`} />
          <KpiCard icon={<Users size={20} className="text-orange-600" />} label="Contacte" value={contacts.total} prev={contacts.last_month} color="bg-orange-50" sub={`+${contacts.this_month} luna aceasta`} />
          <KpiCard icon={<MessageSquare size={20} className="text-pink-600" />} label="De resunat" value={clients.resunat} color="bg-pink-50" sub="urmărire zilnică" />
          <KpiCard icon={<DollarSign size={20} className="text-teal-600" />} label="Valoare portofoliu" value={p.total_value} color="bg-teal-50" sub={`${p.active} prop. active`} />
        </div>

        {/* ── Clienți — Contor Zilnic ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-purple-600" />
              <h3 className="font-bold text-gray-900">Clienți — Contor Zilnic</h3>
            </div>
            <span className="text-xs text-gray-400">{new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-purple-700">{clients.today}</p>
              <p className="text-xs font-medium text-purple-600 mt-1">Noi azi</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-emerald-700">{clients.total}</p>
              <p className="text-xs font-medium text-emerald-600 mt-1">Total clienți</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-blue-700">{clients.won}</p>
              <p className="text-xs font-medium text-blue-600 mt-1">Câștigați</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-amber-700">{clients.resunat}</p>
              <p className="text-xs font-medium text-amber-600 mt-1">De resunat</p>
            </div>
          </div>
          {clients.without_agent > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{clients.without_agent} clienți fără agent responsabil</span>
              <Link href="/clients" className="ml-auto font-medium underline hover:text-amber-900">Alocă</Link>
            </div>
          )}
        </div>

        {/* ── Activități — Statistici ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-blue-600" />
              <h3 className="font-bold text-gray-900">Activități — Statistici</h3>
            </div>
            <Link href="/calendar" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Vezi toate <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-blue-700">{(activities || { today: 0 }).today}</p>
              <p className="text-xs font-medium text-blue-600 mt-1">Programate azi</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-emerald-700">{(activities || { completed_today: 0 }).completed_today}</p>
              <p className="text-xs font-medium text-emerald-600 mt-1">Finalizate azi</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-red-700">{(activities || { overdue: 0 }).overdue}</p>
              <p className="text-xs font-medium text-red-600 mt-1">Restante</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-purple-700">{(activities || { upcoming: 0 }).upcoming}</p>
              <p className="text-xs font-medium text-purple-600 mt-1">Viitoare</p>
            </div>
          </div>
          {activities && activities.by_type.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activities.by_type.map(t => {
                const typeColors: Record<string, string> = {
                  vizionare: 'bg-blue-100 text-blue-700',
                  preluare: 'bg-emerald-100 text-emerald-700',
                  cerere: 'bg-purple-100 text-purple-700',
                  intalnire: 'bg-orange-100 text-orange-700',
                  followup: 'bg-teal-100 text-teal-700',
                  task: 'bg-gray-100 text-gray-600',
                };
                const typeLabels: Record<string, string> = {
                  vizionare: 'Vizionare', preluare: 'Preluare', cerere: 'Cerere',
                  intalnire: 'Întâlnire', followup: 'Follow-up', task: 'Task',
                };
                return (
                  <span key={t.type} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${typeColors[t.type] || 'bg-gray-100 text-gray-600'}`}>
                    {typeLabels[t.type] || t.type}: {t.count}
                  </span>
                );
              })}
            </div>
          )}
          {activities && activities.overdue > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{activities.overdue} activități restante — verifică și actualizează statusul</span>
              <Link href="/calendar" className="ml-auto font-medium underline hover:text-red-900">Deschide</Link>
            </div>
          )}
        </div>

        {/* ── Quick Alerts ── */}
        {(p.no_photos > 0 || p.no_description > 0 || clients.old_uncontacted > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {p.no_photos > 0 && (
              <Link href="/properties" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors">
                <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0"><Image size={18} className="text-amber-600" /></div>
                <div><p className="font-bold text-amber-800 text-sm">{p.no_photos} proprietăți fără poze</p><p className="text-xs text-amber-600">Adaugă fotografii pentru mai multe vizualizări</p></div>
              </Link>
            )}
            {p.no_description > 0 && (
              <Link href="/properties" className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition-colors">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><FileText size={18} className="text-blue-600" /></div>
                <div><p className="font-bold text-blue-800 text-sm">{p.no_description} fără descriere</p><p className="text-xs text-blue-600">Completează descrierile pentru SEO mai bun</p></div>
              </Link>
            )}
            {clients.old_uncontacted > 0 && (
              <Link href="/clients" className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors">
                <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0"><Clock size={18} className="text-red-600" /></div>
                <div><p className="font-bold text-red-800 text-sm">{clients.old_uncontacted} clienți neatinși</p><p className="text-xs text-red-600">Clienți noi mai vechi de 14 zile, fără răspuns</p></div>
              </Link>
            )}
          </div>
        )}

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Monthly Bar Chart */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon={<Activity size={18} />} title="Proprietăți adăugate — 12 luni" />
            <BarChart data={p.by_month} />
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#0E6B54' }} />Luna curentă</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#0E6B5470' }} />Luni anterioare</span>
            </div>
          </div>

          {/* Category Donut */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon={<Building2 size={18} />} title="Pe categorii" />
            {donutData.length > 0 ? (
              <div className="flex items-center gap-4">
                <DonutChart data={donutData} />
                <div className="space-y-2 flex-1">
                  {donutData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-600 truncate">{d.label}</span>
                      </div>
                      <span className="font-bold text-gray-800 ml-2">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Nicio proprietate</div>
            )}
          </div>
        </div>

        {/* ── Middle Row: Agent Leaderboard + Notifications ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agent Leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle
              icon={<Award size={18} />}
              title="Performanță agenți"
              action={<Link href="/team" className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">Echipă <ChevronRight size={12} /></Link>}
            />
            {team.leaderboard.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-sm">Niciun agent</div>
            ) : (
              <div className="space-y-3">
                {team.leaderboard.slice(0, 5).map((agent, i) => (
                  <div key={agent.user_id} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
                        <span className="text-xs font-bold text-emerald-600 ml-2">{agent.score}p</span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                        <span><span className="font-medium text-gray-600">{agent.active}</span> active</span>
                        <span><span className="font-medium text-gray-600">{agent.sold}</span> vândate</span>
                        <span><span className="font-medium text-gray-600">{agent.clients}</span> clienți</span>
                        <span><span className="font-medium text-blue-600">{agent.activities || 0}</span> activit.</span>
                      </div>
                    </div>
                    {i === 0 && <Star size={14} className="text-yellow-500 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon={<Bell size={18} />} title="Notificări & Alerte" />
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-sm">Nicio notificare</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notifications.map((n, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-sm ${notifBg[n.severity] || notifBg[n.type] || 'bg-gray-50 border-gray-200'}`}>
                    <div className="mt-0.5 flex-shrink-0">{notifIcon[n.type] || notifIcon[n.severity] || <Bell size={14} />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-xs leading-snug">{n.message}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{relativeTime(n.created_at)} în urmă</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── AI Suggestions + Quality ── */}
        {p.quality_alerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon={<Zap size={18} />} title="Sugestii AI — Calitate portofoliu" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {p.quality_alerts.map((a, i) => {
                const sev = a.severity === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50';
                const ic = a.severity === 'high' ? <AlertTriangle size={14} className="text-red-600" /> : <Eye size={14} className="text-amber-600" />;
                const typeIcon = a.type === 'no_photos' ? <Image size={14} className="text-gray-400" /> : a.type === 'no_description' ? <FileText size={14} className="text-gray-400" /> : <DollarSign size={14} className="text-gray-400" />;
                return (
                  <Link key={i} href={`/properties/${a.id}`} className={`flex items-center gap-3 p-3 rounded-xl border ${sev} hover:opacity-80 transition-opacity`}>
                    <div className="flex-shrink-0">{ic}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {typeIcon}
                        <p className="text-xs font-mono text-gray-400">{a.code}</p>
                      </div>
                      <p className="text-xs font-medium text-gray-800 truncate">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.message}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bottom Row: Recent Props + Activity ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recent Properties */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle
              icon={<Home size={18} />}
              title="Proprietăți recente"
              action={<Link href="/properties" className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">Vezi toate <ChevronRight size={12} /></Link>}
            />
            {p.recent.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-sm">Nicio proprietate</div>
            ) : (
              <div className="space-y-2.5">
                {p.recent.map(prop => {
                  const statusC: Record<string, string> = { activa: 'bg-emerald-100 text-emerald-700', rezervata: 'bg-amber-100 text-amber-700', tranzactionata: 'bg-blue-100 text-blue-700', vanduta_noi: 'bg-blue-100 text-blue-700', vanduta_altii: 'bg-teal-100 text-teal-700', inchiriata: 'bg-purple-100 text-purple-700', retrasa: 'bg-gray-100 text-gray-500', expirata: 'bg-orange-100 text-orange-600', draft: 'bg-yellow-100 text-yellow-700', arhivata: 'bg-gray-100 text-gray-500' };
                  const statusL: Record<string, string> = { activa: 'Activă', rezervata: 'Rezervată', tranzactionata: 'Tranzacț.', vanduta_noi: 'Vândută', vanduta_altii: 'Vândută', inchiriata: 'Închiriată', retrasa: 'Retrasă', expirata: 'Expirată', draft: 'Draft', arhivata: 'Arhivată' };
                  return (
                    <Link key={prop.id} href={`/properties/${prop.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Home size={15} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-emerald-700">{prop.title || prop.internal_code}</p>
                        <p className="text-xs text-gray-400">{CAT_LABELS[prop.category] || prop.category} · {prop.city}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusC[prop.status] || 'bg-gray-100 text-gray-500'}`}>{statusL[prop.status] || prop.status}</span>
                        <p className="text-xs text-gray-400 mt-0.5">{relativeTime(prop.created_at)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle icon={<Activity size={18} />} title="Activitate recentă" />
            {activity.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-sm">Nicio activitate</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {activity.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {actIcon[ev.type] || <Activity size={12} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-snug">{ev.label}</p>
                      {ev.sub && <p className="text-xs text-gray-400 capitalize">{ev.sub}</p>}
                    </div>
                    <span className="text-xs text-gray-300 flex-shrink-0">{relativeTime(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Clienți — Rezumat ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Clienți noi', value: clients.noi, color: 'bg-emerald-500', icon: <MessageSquare size={16} className="text-white" /> },
            { label: 'De resunat', value: clients.resunat, color: 'bg-blue-500', icon: <Activity size={16} className="text-white" /> },
            { label: 'Câștigați', value: clients.won, color: 'bg-teal-500', icon: <CheckCircle size={16} className="text-white" /> },
            { label: 'Pierduți', value: clients.lost, color: 'bg-red-400', icon: <AlertTriangle size={16} className="text-white" /> },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center flex-shrink-0`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-300 pb-2">
          Actualizat la {lastRefresh.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          {' '}·{' '}
          <button onClick={refresh} className="text-emerald-400 hover:text-emerald-600">Reîmprospătează</button>
        </p>
      </div>
    </ProtectedLayout>
  );
}
