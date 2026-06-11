import { ProtectedLayout } from '@/components/ProtectedLayout';

export default function DashboardPage() {
  return (
    <ProtectedLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8" style={{ color: '#0E6B54' }}>
          Dashboard
        </h1>
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <p className="text-gray-600">Dashboard va fi completat in faza urmatoare...</p>
        </div>
      </div>
    </ProtectedLayout>
  );
}
