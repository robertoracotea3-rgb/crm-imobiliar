'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { CrmModule } from '@/lib/team-roles';
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
} from 'lucide-react';

const menuItems: { href: string; label: string; icon: typeof LayoutDashboard; module: CrmModule }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/properties', label: 'Proprietăți', icon: Building2, module: 'properties' },
  { href: '/contacts', label: 'Contacte', icon: BookUser, module: 'contacts' },
  { href: '/clients', label: 'Clienți', icon: MessageSquare, module: 'leads' },
  { href: '/prospects', label: 'Particulari', icon: Target, module: 'prospects' },
  { href: '/viewings', label: 'Vizionări', icon: Eye, module: 'viewings' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, module: 'calendar' },
  { href: '/finance', label: 'Finanțe', icon: Wallet, module: 'finance' },
  { href: '/portals', label: 'Portaluri', icon: Globe, module: 'portals' },
  { href: '/team', label: 'Echipă', icon: Users, module: 'team' },
  { href: '/notifications', label: 'Notificări', icon: Bell, module: 'notifications' },
  { href: '/settings', label: 'Setări', icon: Settings, module: 'settings' },
];

// Mobile bottom nav — only the 8 most used items (screen space limited)
const mobileMenuItems = ['/dashboard', '/properties', '/clients', '/viewings', '/calendar', '/finance']
  .map(href => menuItems.find(m => m.href === href)!)
  .filter(Boolean);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut, can } = useAuth();
  const [notifCount, setNotifCount] = useState(0);

  const visibleItems = menuItems.filter(item => can(item.module, 'view'));

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

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // Nu afișa sidebar pe pagini de auth
  if (loading) return null;
  if (!user) return null;
  if (pathname?.startsWith('/login') || pathname?.startsWith('/register')) {
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

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around">
        {mobileMenuItems.filter(item => can(item.module, 'view')).map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          const isNotif = item.href === '/notifications';
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
                isActive ? 'text-emerald-700' : 'text-gray-600'
              }`}
              style={isActive ? { color: '#0E6B54' } : {}}
            >
              <span className="relative">
                <Icon size={24} />
                {isNotif && notifCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </span>
              <span className="text-xs">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
        {/* Mobile logout */}
        <button
          onClick={handleLogout}
          className="flex-1 py-3 flex flex-col items-center gap-1 text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={24} />
          <span className="text-xs">Logout</span>
        </button>
      </nav>
    </>
  );
}
