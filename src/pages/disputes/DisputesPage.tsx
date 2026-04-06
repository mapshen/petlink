import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Scale, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { Dispute } from '../../types';
import { getDisputeStatusConfig } from '../../shared/dispute-labels';
import DisputeDetail from '../../components/dispute/DisputeDetail';
import { format } from 'date-fns';

export default function DisputesPage() {
  useDocumentTitle('Disputes');
  const { id } = useParams();
  const { user, token } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(id ? Number(id) : null);

  useEffect(() => {
    const fetchDisputes = async () => {
      try {
        const res = await fetch(`${API_BASE}/disputes`, { headers: getAuthHeaders(token) });
        if (res.ok) {
          const data = await res.json();
          setDisputes(data.disputes);
          if (!selectedId && data.disputes.length > 0) {
            setSelectedId(data.disputes[0].id);
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchDisputes();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (disputes.length === 0 && !id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Scale className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-stone-700">No Disputes</h2>
        <p className="text-sm text-stone-400 mt-1">You don't have any disputes.</p>
      </div>
    );
  }

  // If direct ID route, show detail only
  if (id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <DisputeDetail disputeId={Number(id)} token={token} currentUserId={user?.id} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold text-stone-900 mb-6 flex items-center gap-2">
        <Scale className="w-6 h-6 text-purple-600" />
        Your Disputes
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* List */}
        <div className="space-y-2">
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
                  <span className="text-sm font-semibold text-stone-800">#{d.id}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                    {sc.label}
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-1 truncate">{d.reason}</p>
                <p className="text-[10px] text-stone-400 mt-1">{format(new Date(d.created_at), 'MMM d, yyyy')}</p>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          {selectedId ? (
            <DisputeDetail disputeId={selectedId} token={token} currentUserId={user?.id} />
          ) : (
            <p className="text-sm text-stone-400 text-center py-8">Select a dispute to view details</p>
          )}
        </div>
      </div>
    </div>
  );
}
