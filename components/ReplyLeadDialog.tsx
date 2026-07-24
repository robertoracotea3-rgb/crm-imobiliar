'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, MessageCircle, PhoneOff, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  buildDefaultWhatsAppMessage,
  createWhatsAppLink,
} from '@/lib/whatsapp.mjs';

interface Lead {
  id: string;
  property_id?: string;
  contact_name: string;
  contact_phone: string;
  message: string;
  property_title?: string;
  property_public_url?: string;
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

function defaultNextAction() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function ReplyLeadDialog({ lead, isOpen, onClose, onSuccess }: ReplyLeadDialogProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'compose' | 'confirm'>('compose');
  const [nextActionAt, setNextActionAt] = useState(defaultNextAction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [shareIdempotencyKey, setShareIdempotencyKey] = useState('');

  useEffect(() => {
    if (!isOpen || !lead) return;
    const timer = window.setTimeout(() => {
      setStep('compose');
      setSelectedTemplate('');
      setError('');
      setWarning('');
      setShareIdempotencyKey(crypto.randomUUID());
      setNextActionAt(defaultNextAction());
      setMessage(buildDefaultWhatsAppMessage({
        clientName: lead.contact_name,
        propertyTitle: lead.property_title,
        propertyUrl: lead.property_public_url,
      }));
    }, 0);

    let cancelled = false;
    void supabase
      .from('message_templates')
      .select('id, name, body')
      .limit(20)
      .then(({ data }) => { if (!cancelled) setTemplates(data || []); });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, lead]);

  const selectTemplate = (template: MessageTemplate) => {
    if (!lead) return;
    setMessage(template.body
      .replaceAll('{nume_client}', lead.contact_name || '')
      .replaceAll('{titlu_proprietate}', lead.property_title || 'proprietate')
      .replaceAll('{link_proprietate}', lead.property_public_url || ''));
    setSelectedTemplate(template.id);
  };

  const recordOutcome = async (
    action: 'opened' | 'confirmed_sent' | 'not_sent' | 'unreachable',
  ) => {
    if (!lead) throw new Error('Clientul lipsește');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sesiunea a expirat');
    const response = await fetch('/api/leads/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        lead_id: lead.id,
        action,
        property_id: action === 'confirmed_sent' ? lead.property_id || null : null,
        share_idempotency_key: action === 'confirmed_sent' && lead.property_id
          ? shareIdempotencyKey
          : null,
        next_action_at: ['confirmed_sent', 'unreachable'].includes(action)
          ? new Date(nextActionAt).toISOString()
          : null,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Rezultatul nu a putut fi salvat');
    return typeof data.property_share_warning === 'string'
      ? data.property_share_warning
      : null;
  };

  const openWhatsApp = () => {
    if (!lead) return;
    setError('');
    const result = createWhatsAppLink({ phone: lead.contact_phone, message });
    if (!result.ok || !result.url) {
      setError(result.reason === 'invalid_ro_mobile' || result.reason === 'invalid_e164'
        ? 'Numărul de telefon nu este valid pentru WhatsApp.'
        : 'Completează mesajul și un număr de telefon valid.');
      return;
    }

    const popup = window.open(result.url, '_blank');
    if (!popup) {
      setError('Browserul a blocat deschiderea WhatsApp. Permite ferestrele pop-up și încearcă din nou.');
      return;
    }
    popup.opener = null;
    setStep('confirm');
    void recordOutcome('opened').catch(() => {
      setWarning('WhatsApp s-a deschis, dar evenimentul „deschis” nu a putut fi salvat.');
    });
  };

  const confirm = async (action: 'confirmed_sent' | 'not_sent' | 'unreachable') => {
    setLoading(true);
    setError('');
    try {
      const outcomeWarning = await recordOutcome(action);
      onSuccess?.();
      if (outcomeWarning) {
        setWarning(outcomeWarning);
        return;
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rezultatul nu a putut fi salvat');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="mobile-dialog-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 p-5">
          <div>
            <h2 className="text-xl font-bold text-emerald-800">Contactează pe WhatsApp</h2>
            <p className="mt-1 text-sm text-gray-600">{lead.contact_name} · {lead.contact_phone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={22} /></button>
        </header>

        {step === 'compose' ? (
          <div className="space-y-5 p-5">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-1 text-xs font-semibold text-gray-500">MESAJUL CLIENTULUI</p>
              <p className="text-sm text-gray-700">{lead.message || 'Fără mesaj inițial'}</p>
            </div>

            {templates.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Șablon rapid</label>
                <div className="grid gap-2 md:grid-cols-2">
                  {templates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => selectTemplate(template)}
                      className={`rounded-lg border p-3 text-left text-sm ${
                        selectedTemplate === template.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-gray-900">{template.name}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-gray-600">{template.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Mesaj precompletat</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {lead.property_public_url && (
                <a
                  href={lead.property_public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <ExternalLink size={12} /> Verifică linkul public al proprietății
                </a>
              )}
            </div>
            <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
              CRM-ul înregistrează deschiderea și trimiterea numai ca încercări. Clientul devine „Contactat” doar după ce completezi conversația reală în formularul „Înregistrează”.
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <MessageCircle size={34} className="mx-auto mb-2 text-emerald-700" />
              <h3 className="font-bold text-emerald-950">Ai trimis mesajul?</h3>
              <p className="mt-1 text-sm text-emerald-800">Nu putem confirma automat livrarea sau citirea.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Următoarea acțiune</label>
              <input
                type="datetime-local"
                value={nextActionAt}
                onChange={(event) => setNextActionAt(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirm('confirmed_sent')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Check size={16} /> Da, mesaj trimis (încercare)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirm('not_sent')}
                className="rounded-lg border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Nu
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirm('unreachable')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <PhoneOff size={16} /> Nu am putut contacta
              </button>
            </div>
          </div>
        )}

        {(error || warning) && (
          <div className={`mx-5 mb-4 rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {error || warning}
          </div>
        )}

        {step === 'compose' && (
          <footer className="flex gap-3 border-t border-gray-200 p-5">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50">Anulează</button>
            <button
              type="button"
              onClick={openWhatsApp}
              disabled={!message.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <MessageCircle size={18} /> Deschide WhatsApp
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
