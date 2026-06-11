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
  loading: boolean;
  signUp: (email: string, password: string, agencyName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
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
    try {
      const { data } = await supabase
        .from('profiles')
        .select('agency_id, agencies(id, name)')
        .eq('user_id', userId)
        .single();

      if (data?.agencies) {
        setAgency(data.agencies as Agency);
      }
    } catch (err) {
      console.error('Error fetching agency:', err);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    agencyName: string
  ) => {
    try {
      // Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Create agency
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .insert([{ name: agencyName }])
        .select()
        .single();

      if (agencyError) throw agencyError;

      // Create owner profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            user_id: authData.user.id,
            agency_id: agencyData.id,
            role: 'owner',
          },
        ]);

      if (profileError) throw profileError;

      // Create default message templates
      await createDefaultTemplates(agencyData.id);

      setUser({
        id: authData.user.id,
        email: authData.user.email || '',
      });
      setAgency(agencyData);
    } catch (err) {
      throw err;
    }
  };

  const createDefaultTemplates = async (agencyId: string) => {
    const templates = [
      {
        agency_id: agencyId,
        name: 'Prezentare proprietate',
        subject: 'Proprietatea {titlu_proprietate}',
        body: 'Bună {nume_client},\n\nVă prezint proprietatea {titlu_proprietate} cu prețul de {pret} RON.\n\nDoriti să vizitati?\n\nAsteptam raspunsul dvs.',
      },
      {
        agency_id: agencyId,
        name: 'Follow-up lead',
        subject: 'Urmărire - {titlu_proprietate}',
        body: 'Bună {nume_client},\n\nNu ati raspuns inca la oferta pentru {titlu_proprietate}. Sunt disponibil pentru orice intrebari!\n\nAsteptam.\n{nume_agent}',
      },
    ];

    await supabase.from('message_templates').insert(templates);
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
  };

  return (
    <AuthContext.Provider value={{ user, agency, loading, signUp, signIn, signOut }}>
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
