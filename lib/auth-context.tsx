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

interface AuthContextType {
  user: User | null;
  agency: Agency | null;
  role: CrmRole | null;
  permissions: PermissionMap;
  can: (module: CrmModule, action?: CrmAction) => boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function writeAuthAudit(action: 'login' | 'logout', accessToken: string): Promise<void> {
  const response = await fetch('/api/auth/audit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error('Jurnalul de autentificare nu este disponibil.');
}

async function writeFailedLoginAudit(): Promise<void> {
  await fetch('/api/auth/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login_failed' }),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [role, setRole] = useState<CrmRole | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  const fetchUserAgency = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('agency_id, role, permissions, status, agencies(id, name)')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('fetchUserAgency error:', error.message);
      return;
    }

    if (data?.status && data.status !== 'active') {
      setRole('viewer');
      setPermissions({});
      setAgency(null);
      return;
    }

    const nextRole = normalizeCrmRole(data?.role);
    setRole(nextRole);
    setPermissions(effectivePermissions(nextRole, data?.permissions));
    if (data?.agencies && Array.isArray(data.agencies) && data.agencies.length > 0) {
      setAgency(data.agencies[0] as Agency);
    } else if (data?.agencies && !Array.isArray(data.agencies)) {
      setAgency(data.agencies as Agency);
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
        });
        await fetchUserAgency(data.session.user.id);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchUserAgency]);

  // Check session on mount and keep the permission context synchronized.
  useEffect(() => {
    void checkSession();
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
        await fetchUserAgency(session.user.id);
      } else {
        setUser(null);
        setAgency(null);
        setRole(null);
        setPermissions({});
      }
    });

    return () => data?.subscription.unsubscribe();
  }, [checkSession, fetchUserAgency]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      await writeFailedLoginAudit().catch(() => undefined);
      throw error;
    }
    if (!data.user || !data.session?.access_token) throw new Error('Sign in failed');

    try {
      await writeAuthAudit('login', data.session.access_token);
    } catch (auditError) {
      await supabase.auth.signOut();
      throw auditError;
    }

    setUser({
      id: data.user.id,
      email: data.user.email || '',
    });
    await fetchUserAgency(data.user.id);
  };

  const signOut = async () => {
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    try {
      if (accessToken) await writeAuthAudit('logout', accessToken);
    } catch (auditError) {
      console.error('auth audit failed:', auditError instanceof Error ? auditError.message : 'unknown');
    } finally {
      await supabase.auth.signOut();
      setUser(null);
      setAgency(null);
      setRole(null);
      setPermissions({});
    }
  };

  const can = (module: CrmModule, action: CrmAction = 'view') =>
    permissions[module]?.[action] === true;

  return (
    <AuthContext.Provider value={{ user, agency, role, permissions, can, loading, signIn, signOut }}>
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
