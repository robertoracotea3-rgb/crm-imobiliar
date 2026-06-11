'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AddPropertyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  'apartament',
  'casa_vila',
  'spatiu_comercial',
  'spatiu_industrial',
  'teren',
  'pensiune_hotel',
  'birou',
  'garaj',
];

type Step = 1 | 2 | 3 | 4;

interface FormData {
  title: string;
  internal_code: string;
  location: string;
  price: number;
  category: string;
  description: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
}

export function AddPropertyDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddPropertyDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>({
    title: '',
    internal_code: '',
    location: '',
    price: 0,
    category: 'apartament',
    description: '',
  });

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
    setError('');
  };

  const validateStep1 = () => {
    if (!formData.title || !formData.internal_code || !formData.location) {
      setError('Completeaza toate campurile obligatorii');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step < 4) setStep((step + 1) as Step);
  };

  const handlePrev = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Nu esti autentificat');

      // Get current agency (we'll set this properly after auth is implemented)
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id')
        .limit(1);

      const agencyId = agencies?.[0]?.id;
      if (!agencyId) throw new Error('Nu s-a gasit agentia');

      // Insert property
      const { error: insertError } = await supabase
        .from('properties')
        .insert([
          {
            title: formData.title,
            internal_code: formData.internal_code,
            location: formData.location,
            price: formData.price,
            category: formData.category,
            description: formData.description,
            agency_id: agencyId,
            user_id: user.id,
            attributes: {
              bedrooms: formData.bedrooms,
              bathrooms: formData.bathrooms,
              area: formData.area,
            },
          },
        ]);

      if (insertError) throw insertError;

      onClose();
      onSuccess?.();
    } catch (err) {
      console.error('Eroare:', err);
      setError(
        err instanceof Error ? err.message : 'Eroare la adaugarea proprietatii'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>
            Adauga Proprietate
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 pt-6 flex justify-between items-center">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className="flex flex-col items-center flex-1"
              style={{
                opacity: s <= step ? 1 : 0.5,
              }}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white mb-2 ${
                  s <= step ? 'bg-emerald-700' : 'bg-gray-300'
                }`}
              >
                {s}
              </div>
              <span className="text-xs text-center text-gray-600">
                {['Esential', 'Caracteristici', 'Poze', 'Publicare'][s - 1]}
              </span>
              {s < 4 && (
                <div
                  className={`h-1 flex-1 mx-2 mt-2 ${
                    s < step ? 'bg-emerald-700' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-red-800 text-sm">
              {error}
            </div>
          )}

          {/* Pasul 1: Esential */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Titlul proprietatii *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="ex: Apartament 2 camere, Ultracentral"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cod intern *
                  </label>
                  <input
                    type="text"
                    name="internal_code"
                    value={formData.internal_code}
                    onChange={handleChange}
                    placeholder="ex: AP-001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categorie *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Locatie *
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="ex: Bucuresti, Sector 1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pret (RON)
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price || ''}
                  onChange={handleChange}
                  placeholder="ex: 250000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descriere
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Descriere detaliata a proprietatii..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Pasul 2: Caracteristici */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Camere
                </label>
                <input
                  type="number"
                  name="bedrooms"
                  value={formData.bedrooms || ''}
                  onChange={handleChange}
                  placeholder="ex: 2"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bai
                </label>
                <input
                  type="number"
                  name="bathrooms"
                  value={formData.bathrooms || ''}
                  onChange={handleChange}
                  placeholder="ex: 1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suprafata (m²)
                </label>
                <input
                  type="number"
                  name="area"
                  value={formData.area || ''}
                  onChange={handleChange}
                  placeholder="ex: 65"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="text-gray-500 text-sm mt-6">
                <p>⚙️ Mai multe caracteristici vor fi adaugate in viitor...</p>
              </div>
            </div>
          )}

          {/* Pasul 3: Poze */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <p className="text-gray-600">
                  📸 Drag & drop poze aici sau click pentru a selecta
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  PNG, JPG pana la 10MB
                </p>
              </div>
              <div className="text-gray-500 text-sm">
                <p>Upload de poze va fi implementat in faza urmatoare...</p>
              </div>
            </div>
          )}

          {/* Pasul 4: Publicare */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Publica pe portaluri
                </label>
                <div className="space-y-2">
                  {['Site propriu', 'Imobiliare.ro', 'OLX', 'Storia'].map(
                    (portal) => (
                      <label key={portal} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          defaultChecked={false}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-gray-700">{portal}</span>
                      </label>
                    )
                  )}
                </div>
              </div>
              <div className="text-gray-500 text-sm mt-6">
                <p>🌍 Publicare automata va fi configurata mai tarziu...</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex justify-between gap-4">
          {step > 1 && (
            <button
              onClick={handlePrev}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <ChevronLeft size={18} />
              Inapoi
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 text-white rounded-lg hover:opacity-90 flex items-center gap-2 transition-colors"
              style={{ backgroundColor: '#0E6B54' }}
            >
              Inainte
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#0E6B54' }}
            >
              {loading ? 'Se salveaza...' : 'Salveaza Proprietate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
