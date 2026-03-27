import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { Shield, Check, X, Loader2, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { format } from 'date-fns';

interface AdminSitter {
  id: number;
  email: string;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  approval_status: string;
  approved_at?: string;
  approval_rejected_reason?: string;
}

type Tab = 'pending' | 'all';

export default function AdminPage() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [pendingSitters, setPendingSitters] = useState<AdminSitter[]>([]);
  const [allSitters, setAllSitters] = useState<AdminSitter[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectDialogSitter, setRejectDialogSitter] = useState<AdminSitter | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    fetchPending();
    fetchAll();
  }, [token]);

  const fetchPending = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pending-sitters`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setPendingSitters(data.sitters);
    } catch {
      setError('Failed to load pending sitters.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAll = async () => {
    try {
      const url = statusFilter
        ? `${API_BASE}/admin/sitters?status=${statusFilter}&limit=50`
        : `${API_BASE}/admin/sitters?limit=50`;
      const res = await fetch(url, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAllSitters(data.sitters);
      setAllTotal(data.total);
    } catch {
      setError('Failed to load sitters.');
    }
  };

  useEffect(() => {
    fetchAll();
  }, [statusFilter]);

  const handleApprove = async (sitterId: number) => {
    setProcessingId(sitterId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/sitters/${sitterId}/approval`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) throw new Error('Failed to approve');
      setPendingSitters((prev) => prev.filter((s) => s.id !== sitterId));
      fetchAll();
    } catch {
      setError('Failed to approve sitter.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialogSitter) return;
    setProcessingId(rejectDialogSitter.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/sitters/${rejectDialogSitter.id}/approval`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status: 'rejected', reason: rejectReason || undefined }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      setPendingSitters((prev) => prev.filter((s) => s.id !== rejectDialogSitter.id));
      setRejectDialogSitter(null);
      setRejectReason('');
      fetchAll();
    } catch {
      setError('Failed to reject sitter.');
    } finally {
      setProcessingId(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approved</Badge>;
      case 'pending_approval': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-7 h-7 text-emerald-600" />
        <h1 className="text-3xl font-bold text-stone-900">Admin</h1>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'pending' ? 'default' : 'outline'}
          onClick={() => setTab('pending')}
          size="sm"
        >
          Pending ({pendingSitters.length})
        </Button>
        <Button
          variant={tab === 'all' ? 'default' : 'outline'}
          onClick={() => setTab('all')}
          size="sm"
        >
          All Sitters ({allTotal})
        </Button>
      </div>

      {tab === 'pending' && (
        <div className="space-y-4">
          {pendingSitters.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
              <Check className="w-12 h-12 mx-auto mb-4 text-emerald-300" />
              <p className="text-stone-500">No pending approvals.</p>
            </div>
          ) : (
            pendingSitters.map((sitter) => (
              <Card key={sitter.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <img
                        src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                        alt={sitter.name}
                        className="w-10 h-10 rounded-full border border-stone-200 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900">{sitter.name}</p>
                        <p className="text-sm text-stone-500">{sitter.email}</p>
                        <p className="text-xs text-stone-400 mt-1">
                          Signed up {format(new Date(sitter.created_at), 'MMM d, yyyy')}
                        </p>
                        {sitter.bio && (
                          <p className="text-sm text-stone-600 mt-2 line-clamp-2">{sitter.bio}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(sitter.id)}
                        disabled={processingId === sitter.id}
                      >
                        {processingId === sitter.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span className="ml-1">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRejectDialogSitter(sitter)}
                        disabled={processingId === sitter.id}
                      >
                        <X className="w-4 h-4" />
                        <span className="ml-1">Reject</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'all' && (
        <div>
          <div className="mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-stone-200 rounded-lg text-sm"
            >
              <option value="">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending_approval">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="space-y-3">
            {allSitters.length === 0 ? (
              <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
                <Users className="w-12 h-12 mx-auto mb-4 text-stone-300" />
                <p className="text-stone-500">No sitters found.</p>
              </div>
            ) : (
              allSitters.map((sitter) => (
                <Card key={sitter.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                        alt={sitter.name}
                        className="w-8 h-8 rounded-full border border-stone-200 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{sitter.name}</p>
                        <p className="text-xs text-stone-500">{sitter.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(sitter.approval_status)}
                      {sitter.approval_status !== 'approved' && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(sitter.id)} disabled={processingId === sitter.id}>
                          Approve
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      <AlertDialog open={rejectDialogSitter !== null} onOpenChange={(open) => { if (!open) { setRejectDialogSitter(null); setRejectReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {rejectDialogSitter?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent them from accepting bookings. You can re-approve later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleReject}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
