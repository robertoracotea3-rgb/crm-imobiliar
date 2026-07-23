'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { CrmAction, CrmModule } from '@/lib/team-roles';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Globe,
  Users,
  LogOut,
  BookUser,
  Settings,
  Bell,
  CalendarDays,
  Eye,
  Wallet,
  Target,
  Ellipsis,
  ShieldCheck,
  X,
} from 'lucide-react';

const menuItems: { href: string; label: string; icon: typeof LayoutDashboard; module: CrmModule; action?: CrmAction }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/properties', label: 'Proprietăți', icon: Building2, module: 'properties' },
  { href: '/contacts', label: 'Contacte', icon: BookUser, module: 'contacts' },
  { href: '/clients', label: 'Clienți', icon: MessageSquare, module: 'leads' },
  { href: '/pipeline', label: 'Pipeline', icon: Target, module: 'leads' },
  { href: '/prospects', label: 'Particulari', icon: Target, module: 'prospects' },
  { href: '/viewings', label: 'Vizionări', icon: Eye, module: 'viewings' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, module: 'calendar' },
  { href: '/finance', label: 'Finanțe', icon: Wallet, module: 'finance' },
  { href: '/portals', label: 'Portaluri', icon: Globe, module: 'portals' },
  { href: '/team', label: 'Echipă', icon: Users, module: 'team' },
  { href: '/audit', label: 'Jurnal audit', icon: ShieldCheck, module: 'team', action: 'manage_permissions' },
  { href: '/notifications', label: 'Notificări', icon: Bell, module: 'notifications' },
  { href: '/settings', label: 'Setări', icon: Settings, module: 'settings' },
];

// Acțiunile folosite cel mai des rămân la un deget distanță. Restul sunt
// disponibile în „Mai mult”, fără să dispară funcționalități pe ecrane mici.
const mobilePrimaryItems = ['/dashboard', '/properties', '/clients', '/viewings']
  .map(href => menuItems.find(m => m.href === href)!)
  .filter(Boolean);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut, can } = useAuth();
  const [notifCount, setNotifCount] = useState(0);
  const [moreOpenForPath, setMoreOpenForPath] = useState<string | null>(null);
  const moreOpen = moreOpenForPath === pathname;

  const visibleItems = menuItems.filter(item => can(item.module, item.action || 'view'));
  const primaryHrefs = new Set(mobilePrimaryItems.map(item => item.href));
  const mobileMoreItems = visibleItems.filter(item => !primaryHrefs.has(item.href));
  const moreIsActive = mobileMoreItems.some(item => (
    pathname === item.href || pathname.startsWith(`${item.href}/`)
  ));

  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/notifications?summary=1', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const d = await res.json();
      setNotifCount(Number(d.unread_count || 0));
    };
    void fetchCount();
    const iv = setInterval(fetchCount, 60000);
    const refresh = () => void fetchCount();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('crm:notifications-changed', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(iv);
      window.removeEventListener('crm:notifications-changed', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpenForPath(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // Nu afișa sidebar pe pagini de auth
  if (loading) return null;
  if (!user) return null;
  if (
    pathname?.startsWith('/login')
    || pathname?.startsWith('/register')
    || pathname?.startsWith('/auth/')
    || pathname?.startsWith('/recuperare-parola')
  ) {
    return null;
  }

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col bg-white border-r border-gray-200 z-30">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-center bg-white flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-kira.webp" alt="KIRA Imobiliare" width={360} height={240} className="h-16 w-auto" />
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            const isNotif = item.href === '/notifications';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
                style={isActive ? { backgroundColor: '#E8F5F0', color: '#0E6B54' } : {}}
              >
                <span className="relative">
                  <Icon size={20} />
                  {isNotif && notifCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                      {notifCount > 99 ? '99+' : notifCount}
                    </span>
                  )}
                </span>
                <span className="font-medium">{item.label}</span>
                {isNotif && notifCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors text-sm"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
          {user && (
            <p className="text-xs text-gray-500 mt-2 truncate text-center">{user.email}</p>
          )}
        </div>
      </aside>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
          <button
            type="button"
            aria-label="Închide meniul Mai mult"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setMoreOpenForPath(null)}
          />
          <section id="mobile-more-menu" className="mobile-more-sheet absolute inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-h-[min(72dvh,38rem)] overflow-y-auto rounded-t-3xl border-t border-gray-200 bg-white px-4 pb-4 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 id="mobile-more-title" className="font-bold text-gray-900">Mai mult</h2>
                <p className="text-xs text-gray-500">Toate modulele la care ai acces</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpenForPath(null)}
                className="mobile-touch-target flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                aria-label="Închide"
              >
                <X size={22} />
              </button>
            </div>
            <nav className="grid grid-cols-2 gap-2" aria-label="Meniu mobil extins">
              {mobileMoreItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const isNotif = item.href === '/notifications';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-touch-target flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="relative">
                      <Icon size={20} />
                      {isNotif && notifCount > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                          {notifCount > 99 ? '99+' : notifCount}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="mobile-touch-target mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"
            >
              <LogOut size={19} />
              Deconectare
            </button>
            {user && <p className="mt-2 truncate text-center text-xs text-gray-400">{user.email}</p>}
          </section>
        </div>
      )}

      {/* Bottom nav mobile */}
      <nav
        className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 flex min-h-[4.5rem] items-start justify-around border-t border-gray-200 bg-white"
        aria-label="Navigație principală mobilă"
      >
        {mobilePrimaryItems.filter(item => can(item.module, 'view')).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-touch-target flex min-h-16 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
                isActive ? 'text-emerald-700' : 'text-gray-600'
              }`}
              style={isActive ? { color: '#0E6B54' } : {}}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={22} />
              <span className="text-xs">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpenForPath(openPath => openPath === pathname ? null : pathname)}
          className={`mobile-touch-target relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
            moreOpen || moreIsActive ? 'text-emerald-700' : 'text-gray-600'
          }`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
        >
          <span className="relative">
            <Ellipsis size={24} />
            {notifCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </span>
          <span className="text-xs">Mai mult</span>
        </button>
      </nav>
    </>
  );
}
