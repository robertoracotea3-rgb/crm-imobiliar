'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { LeadsList } from '@/components/LeadsList';
import { ReplyLeadDialog } from '@/components/ReplyLeadDialog';
import { MessageCircle, TrendingUp, Clock } from 'lucide-react';

interface Lead {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  message: string;
  property_title?: string;
  received_at: string;
  first_response_at?: string;
  status: 'new' | 'replied' | 'contacted';
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .order('received_at', { ascending: false });

      if (fetchError) throw fetchError;

      setLeads(data || []);
    } catch (err) {
      console.error('Eroare:', err);
      setError('Nu am putut incarca lead-uri');
    } finally {
      setLoading(false);
    }
  };

  const handleReplyClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsReplyOpen(true);
  };

  // Statistici
  const newLeads = leads.filter((l) => l.status === 'new').length;
  const avgResponseTime =
    leads.length > 0
      ? Math.round(
          leads
            .filter((l) => l.first_response_at)
            .reduce((sum, l) => {
              const responseMs =
                new Date(l.first_response_at!).getTime() -
                new Date(l.received_at).getTime();
              return sum + responseMs / (1000 * 60); // in minutes
            }, 0) / leads.filter((l) => l.first_response_at).length
        )
      : 0;

  return (
    <ProtectedLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8" style={{ color: '#0E6B54' }}>
          Lead-uri
        </h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm border-l-4" style={{ borderColor: '#0E6B54' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Lead-uri Noi</p>
                <p className="text-3xl font-bold mt-2">{newLeads}</p>
              </div>
              <MessageCircle size={32} style={{ color: '#0E6B54' }} className="opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border-l-4" style={{ borderColor: '#F59E0B' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Lead-uri</p>
                <p className="text-3xl font-bold mt-2">{leads.length}</p>
              </div>
              <TrendingUp size={32} style={{ color: '#F59E0B' }} className="opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border-l-4" style={{ borderColor: '#10B981' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Timp Med. Raspuns</p>
                <p className="text-3xl font-bold mt-2">{avgResponseTime}m</p>
              </div>
              <Clock size={32} style={{ color: '#10B981' }} className="opacity-20" />
            </div>
          </div>
        </div>

        {/* Inbox */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Se incarca...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              {leads.length} lead-uri in total
            </p>
            <LeadsList leads={leads} onReply={handleReplyClick} />
          </div>
        )}

        <ReplyLeadDialog
          lead={selectedLead}
          isOpen={isReplyOpen}
          onClose={() => {
            setIsReplyOpen(false);
            setSelectedLead(null);
          }}
          onSuccess={() => {
            fetchLeads();
          }}
        />
      </div>
    </ProtectedLayout>
  );
}
