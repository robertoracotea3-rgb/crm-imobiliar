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

type MfaMethod = 'totp' | 'phone';

interface AuthContextType {
  user: User | null;
  agency: Agency | null;
  role: 'owner' | 'admin' | 'agent' | null;
  loading: boolean;
  mfaRequired: boolean;
  mfaMethod: MfaMethod | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  completeMfa: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'agent' | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<MfaMethod | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<{
    factorId: string;
    challengeId: string;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchUserAgency = async (userId: string) => {
    setAuthError(null);
    setRole(null);
    setAgency(null);

    try {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;

      if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const totpFactor = factors?.totp?.find((factor) => factor.status === 'verified');
        const phoneFactor = factors?.phone?.find((factor) => factor.status === 'verified');
        const factor = totpFactor ?? phoneFactor;
        if (!factor) {
          throw new Error('Nu există un factor MFA verificat pentru acest cont.');
        }

        const { data: challenge, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) throw challengeError;
        if (!challenge?.id) throw new Error('Nu s-a putut iniția verificarea MFA.');

        setMfaChallenge({ factorId: factor.id, challengeId: challenge.id });
        setMfaMethod(totpFactor ? 'totp' : 'phone');
        setMfaRequired(true);
        return;
      }

      const { error: sessionError } = await supabase.rpc('crm_sync_session');
      if (sessionError) throw sessionError;

      const { data, error } = await supabase
        .from('profiles')
        .select('agency_id, role, agencies(id, name)')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      setRole((data?.role as 'owner' | 'admin' | 'agent') || 'agent');
      const linkedAgency = data?.agencies;
      if (Array.isArray(linkedAgency)) {
        setAgency((linkedAgency[0] as Agency | undefined) ?? null);
      } else {
        setAgency((linkedAgency as Agency | null) ?? null);
      }
      setMfaRequired(false);
      setMfaMethod(null);
      setMfaChallenge(null);
    } catch (error) {
      console.error('fetchUserAgency error:', error);
      setAuthError(
        'Sesiunea CRM nu mai este validă. Ieși din cont și autentifică-te din nou.'
      );
    }
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });

        if (event === 'INITIAL_SESSION') {
          window.setTimeout(() => {
            void fetchUserAgency(session.user.id).finally(() => setLoading(false));
          }, 0);
        }
      } else {
        setUser(null);
        setAgency(null);
        setRole(null);
        setMfaRequired(false);
        setMfaMethod(null);
        setMfaChallenge(null);
        setAuthError(null);
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          setLoading(false);
        }
      }
    });

    return () => data?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || loading || mfaRequired || authError) return;

    const syncVisibleSession = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.rpc('crm_sync_session').then(({ error }) => {
        if (error) {
          console.error('CRM session refresh error:', error);
          setAuthError(
            'Sesiunea CRM a expirat. Ieși din cont și autentifică-te din nou.'
          );
        }
      });
    };

    const interval = window.setInterval(syncVisibleSession, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', syncVisibleSession);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncVisibleSession);
    };
  }, [user?.id, loading, mfaRequired, authError]);

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

  const completeMfa = async (code: string) => {
    if (!mfaChallenge) {
      throw new Error('Verificarea MFA nu este pregătită. Reîncearcă autentificarea.');
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code: code.trim(),
    });
    if (error) throw error;

    setMfaRequired(false);
    setMfaMethod(null);
    setMfaChallenge(null);
    setAuthError(null);
    if (user) await fetchUserAgency(user.id);
  };

  const signOut = async () => {
    await supabase.rpc('crm_revoke_session');
    await supabase.auth.signOut();
    setUser(null);
    setAgency(null);
    setRole(null);
    setMfaRequired(false);
    setMfaMethod(null);
    setMfaChallenge(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        agency,
        role,
        loading,
        mfaRequired,
        mfaMethod,
        authError,
        signIn,
        completeMfa,
        signOut,
      }}
    >
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
