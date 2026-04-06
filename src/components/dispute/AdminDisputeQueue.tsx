import React, { useEffect, useState } from 'react';
import type { Dispute } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Loader2, Scale } from 'lucide-react';
import { getDisputeStatusConfig } from '../../shared/dispute-labels';
import DisputeDetail from './DisputeDetail';
import { format } from 'date-fns';

interface Props {
  readonly token: string | null;
  readonly currentUserId?: number;
}

export default function AdminDisputeQueue({ token, currentUserId }: Props) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchDisputes = async () => {
    try {
      const url = statusFilter ? `${API_BASE}/disputes?status=${statusFilter}` : `${API_BASE}/disputes`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setDisputes(data.disputes);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchDisputes();
  }, [token, statusFilter]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setSelectedId(null); }}
          className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 text-stone-600 bg-white"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="awaiting_response">Awaiting Response</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-xs text-stone-400 ml-auto">{disputes.length} dispute{disputes.length !== 1 ? 's' : ''}</span>
      </div>

      {disputes.length === 0 ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <Scale className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500">No disputes{statusFilter ? ` with status "${statusFilter.replace(/_/g, ' ')}"` : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Queue list */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {disputes.map((d) => {
              const sc = getDisputeStatusConfig(d.status);
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selectedId === d.id ? 'border-purple-300 bg-purple-50' : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                      <span className="text-sm font-semibold text-stone-900">#{d.id}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    {d.owner_name} vs {d.sitter_name}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5 truncate">{d.reason}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-stone-400">{format(new Date(d.created_at), 'MMM d, h:mm a')}</span>
                    {d.assigned_admin_name ? (
                      <span className="text-[10px] text-purple-600">{d.assigned_admin_name}</span>
                    ) : (
                      <span className="text-[10px] text-red-500">Unassigned</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
            {selectedId ? (
              <DisputeDetail
                disputeId={selectedId}
                token={token}
                currentUserId={currentUserId}
                isAdmin={true}
              />
            ) : (
              <div className="text-center py-12">
                <Scale className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">Select a dispute to review</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
