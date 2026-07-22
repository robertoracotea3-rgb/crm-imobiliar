'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, Phone, Clock } from 'lucide-react';
import { LEAD_STATUSES, getCatalogItem, type LeadStatus } from '@/lib/crm-catalogs';

interface Lead {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  message: string;
  property_title?: string;
  received_at: string;
  first_response_at?: string;
  status: LeadStatus;
}

interface LeadsListProps {
  leads: Lead[];
  onReply?: (lead: Lead) => void;
}

export function LeadsList({ leads, onReply }: LeadsListProps) {
  const [responseTimers, setResponseTimers] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimers: Record<string, string> = {};
      leads.forEach((lead) => {
        if (!lead.first_response_at) {
          const now = new Date();
          const received = new Date(lead.received_at);
          const diff = now.getTime() - received.getTime();

          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

          if (hours > 0) {
            newTimers[lead.id] = `${hours}h ${minutes}m`;
          } else {
            newTimers[lead.id] = `${minutes}m`;
          }
        }
      });
      setResponseTimers(newTimers);
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [leads]);

  if (leads.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">Nu ai lead-uri inca.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => {
        const status = getCatalogItem(LEAD_STATUSES, lead.status);
        const colors = { bg: '#F3F4F6', text: '#374151', badge: status?.label || lead.status };
        const responseTime = responseTimers[lead.id];

        return (
          <div
            key={lead.id}
            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-emerald-300 transition-colors"
            style={{ borderLeftWidth: '4px', borderLeftColor: '#0E6B54' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Contact + Message */}
              <div className="md:col-span-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {lead.contact_name}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <Phone size={14} />
                      {lead.contact_phone}
                    </div>
                    <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                      {lead.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Property + Status */}
              <div className="md:col-span-3">
                {lead.property_title && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-500">
                      PROPRIETATE
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {lead.property_title}
                    </p>
                  </div>
                )}
                <span
                  className="inline-block text-xs px-2 py-1 rounded font-medium"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {colors.badge}
                </span>
              </div>

              {/* Time + Action */}
              <div className="md:col-span-4 flex flex-col justify-between">
                {/* Response Time */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-gray-400" />
                  {lead.first_response_at ? (
                    <span className="text-gray-600">
                      Raspuns in{' '}
                      {Math.floor(
                        (new Date(lead.first_response_at).getTime() -
                          new Date(lead.received_at).getTime()) /
                          (1000 * 60)
                      )}{' '}
                      min
                    </span>
                  ) : (
                    <span className="font-semibold text-orange-600">
                      {responseTime || 'Calculand...'}
                    </span>
                  )}
                </div>

                {/* Reply Button */}
                {!lead.first_response_at && (
                  <button
                    onClick={() => onReply?.(lead)}
                    className="mt-2 px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: '#0E6B54' }}
                  >
                    <MessageCircle size={16} className="inline mr-2" />
                    Raspunde
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
