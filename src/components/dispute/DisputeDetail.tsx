import React, { useEffect, useState } from 'react';
import type { Dispute, DisputeMessage } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Scale, Send, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { getDisputeStatusConfig, getResolutionLabel } from '../../shared/dispute-labels';
import DisputeTimeline from './DisputeTimeline';
import DisputeResolutionForm from './DisputeResolutionForm';
import { formatCents } from '../../lib/money';

interface Props {
  readonly disputeId: number;
  readonly token: string | null;
  readonly currentUserId?: number;
  readonly isAdmin?: boolean;
}

export default function DisputeDetail({ disputeId, token, currentUserId, isAdmin }: Props) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const fetchDispute = async () => {
    try {
      const res = await fetch(`${API_BASE}/disputes/${disputeId}`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error('Failed to load dispute');
      const data = await res.json();
      setDispute(data.dispute);
      setMessages(data.messages);
    } catch {
      setError('Failed to load dispute');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispute();
  }, [disputeId, token]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/disputes/${disputeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({ content: newMessage.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message');
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 py-4">
        <AlertTriangle className="w-4 h-4" />
        {error || 'Dispute not found'}
      </div>
    );
  }

  const statusConfig = getDisputeStatusConfig(dispute.status);
  const isResolved = dispute.status === 'resolved' || dispute.status === 'closed';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-purple-600" />
            <h2 className="text-lg font-bold text-stone-900">Dispute #{dispute.id}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusConfig.bg} ${statusConfig.text}`}>
              {statusConfig.label}
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Filed by {dispute.filed_by_name} · {dispute.service_type?.replace(/_/g, ' ')} · Booking #{dispute.booking_id}
          </p>
        </div>
        {dispute.total_price_cents != null && (
          <div className="text-right">
            <span className="text-xs text-stone-400">Booking Total</span>
            <span className="block text-sm font-bold text-stone-800">{formatCents(dispute.total_price_cents)}</span>
          </div>
        )}
      </div>

      {/* Parties */}
      <div className="bg-stone-50 rounded-xl p-3 flex justify-between text-xs">
        <div>
          <span className="text-stone-400">Owner</span>
          <span className="block font-medium text-stone-700">{dispute.owner_name}</span>
        </div>
        <div className="text-center text-stone-300">vs</div>
        <div className="text-right">
          <span className="text-stone-400">Sitter</span>
          <span className="block font-medium text-stone-700">{dispute.sitter_name}</span>
        </div>
      </div>

      {/* Reason */}
      <div className="bg-purple-50 rounded-xl p-3">
        <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Dispute Reason</span>
        <p className="text-sm text-stone-700 mt-1 whitespace-pre-line">{dispute.reason}</p>
      </div>

      {/* Resolution (if resolved) */}
      {dispute.status === 'resolved' && dispute.resolution_type && (
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Resolution</span>
          <p className="text-sm font-medium text-emerald-800 mt-1">{getResolutionLabel(dispute.resolution_type)}</p>
          {dispute.resolution_amount_cents != null && (
            <p className="text-sm text-emerald-700">Refund: {formatCents(dispute.resolution_amount_cents)}</p>
          )}
          {dispute.resolution_notes && (
            <p className="text-xs text-stone-600 mt-2 italic">{dispute.resolution_notes}</p>
          )}
        </div>
      )}

      {/* Timeline */}
      <div>
        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Messages</h3>
        <div className="max-h-80 overflow-y-auto">
          <DisputeTimeline messages={messages} currentUserId={currentUserId} />
        </div>
      </div>

      {/* Composer (if not resolved) */}
      {!isResolved && (
        <div className="flex gap-2 pt-2 border-t border-stone-100">
          <Textarea
            placeholder="Add a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            maxLength={2000}
            className="min-h-[40px] text-sm"
            rows={1}
          />
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white px-4"
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {/* Admin resolution form */}
      {isAdmin && !isResolved && (
        <DisputeResolutionForm
          disputeId={disputeId}
          bookingTotal={dispute.total_price_cents ?? 0}
          token={token}
          onResolved={fetchDispute}
        />
      )}
    </div>
  );
}
