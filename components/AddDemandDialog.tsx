'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AddDemandDialogProps {
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

export function AddDemandDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddDemandDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    category: 'apartament',
    min_price: '',
    max_price: '',
  });

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');

      if (!formData.title || !formData.location) {
        setError('Completeaza titlul si locatia');
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nu esti autentificat');

      // Get agency
      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.agency_id) throw new Error('Agentia nu gasita');

      // Insert demand
      const { error: insertError } = await supabase
        .from('demands')
        .insert([
          {
            title: formData.title,
            location: formData.location,
            category: formData.category,
            min_price: formData.min_price ? parseInt(formData.min_price) : null,
            max_price: formData.max_price ? parseInt(formData.max_price) : null,
            agency_id: profile.agency_id,
            user_id: user.id,
            criteria: {
              category: formData.category,
              location: formData.location,
              price_range: {
                min: formData.min_price ? parseInt(formData.min_price) : null,
                max: formData.max_price ? parseInt(formData.max_price) : null,
              },
            },
          },
        ]);

      if (insertError) throw insertError;

      setFormData({
        title: '',
        location: '',
        category: 'apartament',
        min_price: '',
        max_price: '',
      });
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la adaugare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>
            Adauga Cerere
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titlul cererii *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="ex: Apartament modern cu 2-3 camere"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
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
              placeholder="ex: Bucuresti, Sector 1-2"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categorie
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pret min (RON)
              </label>
              <input
                type="number"
                name="min_price"
                value={formData.min_price}
                onChange={handleChange}
                placeholder="100000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pret max (RON)
              </label>
              <input
                type="number"
                name="max_price"
                value={formData.max_price}
                onChange={handleChange}
                placeholder="500000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Anuleaza
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#0E6B54' }}
            >
              {loading ? 'Se salveaza...' : 'Salveaza Cerere'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
