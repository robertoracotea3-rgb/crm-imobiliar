'use client';

import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Lead {
  id: string;
  contact_name: string;
  contact_phone: string;
  message: string;
  property_title?: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

interface ReplyLeadDialogProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReplyLeadDialog({
  lead,
  isOpen,
  onClose,
  onSuccess,
}: ReplyLeadDialogProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setMessage('');
      setSelectedTemplate('');
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    try {
      const { data } = await supabase
        .from('message_templates')
        .select('*')
        .limit(5);

      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const handleTemplateSelect = (template: MessageTemplate) => {
    let msg = template.body;

    // Replace variables cu date reale
    if (lead) {
      msg = msg
        .replace('{nume_client}', lead.contact_name)
        .replace('{titlu_proprietate}', lead.property_title || 'proprietate');
    }

    setMessage(msg);
    setSelectedTemplate(template.id);
  };

  const handleSendReply = async () => {
    if (!lead || !message.trim()) {
      setError('Mesajul este gol');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nu esti autentificat');

      // Mark lead as replied
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          first_response_at: new Date().toISOString(),
          status: 'replied',
        })
        .eq('id', lead.id);

      if (updateError) throw updateError;

      // Log activity
      await supabase.from('activities').insert([
        {
          type: 'message_sent',
          description: `Mesaj trimis lui ${lead.contact_name} pe WhatsApp`,
          lead_id: lead.id,
          user_id: user.id,
        },
      ]);

      // TODO: Integreaza cu WhatsApp API real
      // Pentru acum, mock success
      console.log('📱 Mesaj trimis:', {
        to: lead.contact_phone,
        message: message,
      });

      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la trimitere');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#0E6B54' }}>
              Raspunde Lead-ului
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {lead.contact_name} • {lead.contact_phone}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Original Message */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-600 mb-2">
              MESAJ INITIAL
            </p>
            <p className="text-gray-700">{lead.message}</p>
          </div>

          {/* Templates */}
          {templates.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Alege sablon rapid
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className={`text-left p-3 rounded-lg border transition-colors text-sm ${
                      selectedTemplate === template.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="text-gray-600 text-xs line-clamp-1 mt-1">
                      {template.body}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Editor */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Mesajul tau
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scrie mesajul pentru WhatsApp..."
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              Lungime: {message.length} caractere
            </p>
          </div>

          {/* Variables Helper */}
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-900 mb-2">
              Variabile disponibile:
            </p>
            <code className="text-blue-800 text-xs">
              {'{{'}nume_client{'}}'}• {'{{'}titlu_proprietate{'}}'}
            </code>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anuleaza
          </button>
          <button
            onClick={handleSendReply}
            disabled={loading || !message.trim()}
            className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 font-medium"
            style={{ backgroundColor: '#0E6B54' }}
          >
            <Send size={18} />
            {loading ? 'Se trimite...' : 'Trimite pe WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}
