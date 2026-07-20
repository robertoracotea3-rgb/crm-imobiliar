'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { AIPropertyAnalyzer } from '@/components/AIPropertyAnalyzer';
import { ChevronLeft } from 'lucide-react';

interface AnalyzedData {
  title: string;
  location: string;
  category: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  features: string[];
  description_ro: string;
  description_en: string;
}

export default function AIAssistantPage() {
  const router = useRouter();
  const [selectedData, setSelectedData] = useState<AnalyzedData | null>(null);

  const handleUseData = (data: AnalyzedData) => {
    setSelectedData(data);
    // TODO: Pre-fill wizard form cu aceste date
    // Pentru acum, doar afisam confirmare
  };

  return (
    <ProtectedLayout module="properties" action="create">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>
              Asistent AI
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Genera automat informații și descrieri din text liber
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl">
          <AIPropertyAnalyzer onUse={handleUseData} />

          {/* Success Message */}
          {selectedData && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
              <p className="font-medium text-green-900 mb-4">
                ✅ Proprietate analizata cu succes!
              </p>
              <p className="text-green-800 text-sm mb-4">
                Datele extrase vor fi folosite pentru completarea formularului de adaugare.
                Poti sa le editezi inainte de a salva.
              </p>
              <button
                onClick={() => {
                  // TODO: Navigate to wizard with pre-filled data
                  router.push('/properties');
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Continua la formularul de proprietate
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}
