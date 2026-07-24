'use client';

import { use } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { WeeklyReportDashboard } from '@/components/WeeklyReportDashboard';
import { useAuth } from '@/lib/auth-context';

export default function WeeklyReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { can } = useAuth();
  return (
    <ProtectedLayout module="reports">
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <WeeklyReportDashboard
          reportId={id}
          canCreate={can('reports', 'create')}
          canExport={can('reports', 'export')}
          canEditSettings={can('settings', 'edit')}
        />
      </main>
    </ProtectedLayout>
  );
}
