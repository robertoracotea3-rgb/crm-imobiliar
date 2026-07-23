'use client';

import { useState } from 'react';
import { Wand2, ChevronRight, AlertCircle } from 'lucide-react';

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

interface AIPropertyAnalyzerProps {
  onUse?: (data: AnalyzedData) => void;
}

export function AIPropertyAnalyzer({ onUse }: AIPropertyAnalyzerProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzedData | null>(null);

  const handleAnalyze = async () => {
    try {
      setLoading(true);
      setError('');
      setResult(null);

      const response = await fetch('/api/properties/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Eroare la analiza');
      }

      setResult(data.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Eroare la analiza proprietatii'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Wand2 size={24} style={{ color: '#0E6B54' }} />
          <h3 className="text-lg font-bold" style={{ color: '#0E6B54' }}>
            Analisor AI de Proprietati
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Descrie proprietatea in text liber. AI-ul va extrage automat informatiile,
          va genera titluri atractiv si descrieri in romani si engleza.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ex: Apartament spatios de 3 camere in Sector 1, Ultracentral. Recent renovat, cu parchet, living open space, bucatarie moderna, 2 bai. Vedere la parc. Liber de 15 martie..."
          rows={6}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
        />

        <button
          onClick={handleAnalyze}
          disabled={loading || !text.trim()}
          className="mt-4 px-6 py-2.5 text-white rounded-lg font-medium transition-colors hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          style={{ backgroundColor: '#0E6B54' }}
        >
          <Wand2 size={18} />
          {loading ? 'Se analizeaza...' : 'Analizeaza cu AI'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Eroare la analiza</p>
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-6 shadow-sm border border-emerald-200">
          <h3 className="text-lg font-bold mb-6" style={{ color: '#0E6B54' }}>
            Rezultate Analitica
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Titlu (generat)
                </label>
                <div className="mt-1 p-3 bg-white rounded border border-gray-200">
                  <p className="font-semibold text-gray-900">{result.title}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Locatie
                </label>
                <div className="mt-1 p-3 bg-white rounded border border-gray-200">
                  <p className="text-gray-900">{result.location}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Categorie
                  </label>
                  <div className="mt-1 p-2 bg-white rounded border border-gray-200 text-sm">
                    {result.category.replace(/_/g, ' ')}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Pret (RON)
                  </label>
                  <div className="mt-1 p-2 bg-white rounded border border-gray-200 text-sm font-semibold">
                    {result.price?.toLocaleString('ro-RO') || 'N/A'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Camere', value: result.bedrooms },
                  { label: 'Bai', value: result.bathrooms },
                  { label: 'Aria (m²)', value: result.area },
                ].map((item) => (
                  <div key={item.label}>
                    <label className="text-xs font-medium text-gray-700">
                      {item.label}
                    </label>
                    <div className="mt-1 p-2 bg-white rounded border border-gray-200 text-sm text-center">
                      {item.value || '—'}
                    </div>
                  </div>
                ))}
              </div>

              {result.features && result.features.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Caracteristici
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {result.features.map((feature, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white text-gray-700 text-xs rounded border border-gray-300"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Descriptions */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Descriere RO (generata)
                  </span>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                    AI
                  </span>
                </div>
                <div className="p-3 bg-white rounded border border-gray-200 min-h-[150px] text-sm leading-relaxed">
                  {result.description_ro}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Description EN (generated)
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    AI
                  </span>
                </div>
                <div className="p-3 bg-white rounded border border-gray-200 min-h-[150px] text-sm leading-relaxed">
                  {result.description_en}
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          {onUse && (
            <button
              onClick={() => onUse(result)}
              className="w-full py-3 text-white rounded-lg font-medium transition-colors hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0E6B54' }}
            >
              Foloseste aceasta proprietate
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
