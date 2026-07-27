'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  effectivePermissions,
  normalizeCrmRole,
  type CrmAction,
  type CrmModule,
  type CrmRole,
  type PermissionMap,
} from './team-roles';

interface User {
  id: string;
  email: string;
}

interface Agency {
  id: string;
  name: string;
}

interface AuthSecurity {
  aal: 'aal1' | 'aal2';
  mfaRequired: boolean;
  passwordChangeRequired: boolean;
  mailboxRequired: boolean;
  mailboxAddress: string | null;
  sessionId: string | null;
  nextPath: string | null;
}

interface AuthContextType {
  user: User | null;
  agency: Agency | null;
  role: CrmRole | null;
  permissions: PermissionMap;
  security: AuthSecurity | null;
  can: (module: CrmModule, action?: CrmAction) => boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<string>;
  signOut: () => Promise<void>;
  refreshSecurity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function writeLogoutAudit(accessToken: string): Promise<void> {
  const response = await fetch('/api/auth/audit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'logout' }),
  });
  if (!response.ok) throw new Error('Jurnalul de autentificare nu este disponibil.');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [role, setRole] = useState<CrmRole | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [security, setSecurity] = useState<AuthSecurity | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserContext = useCallback(async (accessToken: string) => {
    const response = await fetch('/api/auth/context', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Sesiunea CRM nu poate fi verificată.');
    const data = await response.json();
    const nextRole = normalizeCrmRole(data.role);
    setRole(nextRole);
    setPermissions(effectivePermissions(nextRole, data.permissions));
    setAgency(data.agency || null);
    setUser(data.user ? { id: data.user.id, email: data.user.email || '' } : null);
    setSecurity({
      aal: data.security?.aal === 'aal2' ? 'aal2' : 'aal1',
      mfaRequired: data.security?.mfa_required === true,
      passwordChangeRequired: data.security?.password_change_required === true,
      mailboxRequired: data.security?.mailbox_required === true,
      mailboxAddress: typeof data.security?.mailbox_address === 'string'
        ? data.security.mailbox_address
        : null,
      sessionId: data.security?.session_id || null,
      nextPath: data.security?.next_path || null,
    });
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await fetchUserContext(data.session.access_token);
      }
    } catch {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setUser(null);
      setAgency(null);
      setRole(null);
      setPermissions({});
      setSecurity(null);
    } finally {
      setLoading(false);
    }
  }, [fetchUserContext]);

  // Check session on mount and keep the permission context synchronized.
  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkSession(), 0);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        window.setTimeout(() => void fetchUserContext(session.access_token).catch(() => undefined), 0);
      } else {
        setUser(null);
        setAgency(null);
        setRole(null);
        setPermissions({});
        setSecurity(null);
      }
    });

    return () => {
      window.clearTimeout(initialCheck);
      data?.subscription.unsubscribe();
    };
  }, [checkSession, fetchUserContext]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) return fetchUserContext(data.session.access_token);
        return undefined;
      }).catch(() => undefined);
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [fetchUserContext, user]);

  const signIn = async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token || !data.refresh_token) {
      throw new Error(data.error || 'Autentificare eșuată.');
    }
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) throw new Error('Sesiunea nu a putut fi salvată.');
    await fetchUserContext(data.access_token);
    return typeof data.next_path === 'string' ? data.next_path : '/dashboard';
  };

  const signOut = async () => {
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    try {
      if (accessToken) await writeLogoutAudit(accessToken);
    } catch (auditError) {
      console.error('auth audit failed:', auditError instanceof Error ? auditError.message : 'unknown');
    } finally {
      await supabase.auth.signOut({ scope: 'local' });
      setUser(null);
      setAgency(null);
      setRole(null);
      setPermissions({});
      setSecurity(null);
    }
  };

  const refreshSecurity = useCallback(async () => {
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    if (!accessToken) throw new Error('Sesiunea a expirat.');
    await fetchUserContext(accessToken);
  }, [fetchUserContext]);

  const can = (module: CrmModule, action: CrmAction = 'view') =>
    permissions[module]?.[action] === true;

  return (
    <AuthContext.Provider value={{
      user, agency, role, permissions, security, can, loading, signIn, signOut, refreshSecurity,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
