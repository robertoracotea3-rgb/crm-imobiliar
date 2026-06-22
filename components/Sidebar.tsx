'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  Building2,
  Search,
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
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/properties', label: 'Proprietăți', icon: Building2 },
  { href: '/contacts', label: 'Contacte', icon: BookUser },
  { href: '/matches', label: 'Cereri & potriviri', icon: Search },
  { href: '/leads', label: 'Lead-uri', icon: MessageSquare },
  { href: '/viewings', label: 'Vizionări', icon: Eye },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/finance', label: 'Finanțe', icon: Wallet },
  { href: '/portals', label: 'Portaluri', icon: Globe },
  { href: '/team', label: 'Echipă', icon: Users },
  { href: '/notifications', label: 'Notificări', icon: Bell },
  { href: '/settings', label: 'Setări', icon: Settings },
];

// Mobile bottom nav — only the 8 most used items (screen space limited)
const mobileMenuItems = ['/dashboard', '/properties', '/matches', '/leads', '/viewings', '/calendar', '/finance']
  .map(href => menuItems.find(m => m.href === href)!)
  .filter(Boolean);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();
  const [notifCount, setNotifCount] = useState(0);

  // Restrict owner-only items (Finance, Portals, Team, Settings) to owners only
  const visibleItems = menuItems.filter(item => {
    if (['​/finance', '/portals', '/team', '/settings'].includes(item.href)) {
      return role === 'owner';
    }
    return true;
  });

  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const lastSeen = parseInt(localStorage.getItem('notif_last_seen') || '0', 10);
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      const unseen = (d.notifications || []).filter(
        (n: { created_at: string }) => new Date(n.created_at).getTime() > lastSeen
      ).length;
      setNotifCount(unseen);
    };
    fetchCount();
    const iv = setInterval(fetchCount, 60000);
    return () => clearInterval(iv);
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
          <img src="/images/logo-kira.png" alt="KIRA Imobiliare" className="h-16 w-auto" />
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
                onClick={() => { if (isNotif) { localStorage.setItem('notif_last_seen', Date.now().toString()); setNotifCount(0); } }}
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
        {mobileMenuItems.filter(item => {
          if (item.href === '/finance') return role === 'owner';
          return true;
        }).map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          const isNotif = item.href === '/notifications';
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => { if (isNotif) { localStorage.setItem('notif_last_seen', Date.now().toString()); setNotifCount(0); } }}
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
