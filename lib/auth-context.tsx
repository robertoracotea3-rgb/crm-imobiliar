'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

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
  role: 'owner' | 'admin' | 'agent' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'agent' | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    checkSession();
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
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
      }
    });

    return () => data?.subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
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
  };

  const fetchUserAgency = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('agency_id, role, agencies(id, name)')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('fetchUserAgency error:', error.message);
      return;
    }

    setRole((data?.role as 'owner' | 'admin' | 'agent') || 'agent');
    if (data?.agencies && Array.isArray(data.agencies) && data.agencies.length > 0) {
      setAgency(data.agencies[0] as Agency);
    } else if (data?.agencies && !Array.isArray(data.agencies)) {
      setAgency(data.agencies as Agency);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('Sign in failed');

    setUser({
      id: data.user.id,
      email: data.user.email || '',
    });
    await fetchUserAgency(data.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAgency(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, agency, role, loading, signIn, signOut }}>
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
