'use client';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { WeeklyReportDashboard } from '@/components/WeeklyReportDashboard';
import { useAuth } from '@/lib/auth-context';

export default function WeeklyReportsPage() {
  const { can } = useAuth();
  return (
    <ProtectedLayout module="reports">
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <WeeklyReportDashboard
          canCreate={can('reports', 'create')}
          canExport={can('reports', 'export')}
          canEditSettings={can('settings', 'edit')}
        />
      </main>
    </ProtectedLayout>
  );
}
