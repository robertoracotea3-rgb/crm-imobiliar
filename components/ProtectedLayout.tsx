'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { CrmAction, CrmModule } from '@/lib/team-roles';

export function ProtectedLayout({
  children,
  module,
  action = 'view',
}: {
  children: React.ReactNode;
  module?: CrmModule;
  action?: CrmAction;
}) {
  const router = useRouter();
  const { user, loading, can } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Se incarca...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (module && !can(module, action)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-amber-900">Acces restricționat</h1>
          <p className="mt-2 text-sm text-amber-800">
            Rolul tău nu are permisiunea necesară pentru această secțiune.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
