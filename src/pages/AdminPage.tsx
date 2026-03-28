import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { Shield, Check, X, Ban, Loader2, Users, MapPin, Home, PawPrint, Award, ChevronDown, ChevronUp } from 'lucide-react';
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
  years_experience?: number;
  home_type?: string;
  has_yard?: boolean;
  has_fenced_yard?: boolean;
  has_own_pets?: boolean;
  own_pets_description?: string;
  accepted_species?: string[];
  skills?: string[];
}

type Tab = 'pending' | 'all';
type ActionType = 'reject' | 'ban';

export default function AdminPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [pendingSitters, setPendingSitters] = useState<AdminSitter[]>([]);
  const [allSitters, setAllSitters] = useState<AdminSitter[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [actionDialogSitter, setActionDialogSitter] = useState<AdminSitter | null>(null);
  const [actionType, setActionType] = useState<ActionType>('reject');
  const [actionReason, setActionReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!user?.is_admin) return;
    fetchPending();
    fetchAll();
  }, [token]);

  if (authLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }
  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

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

  const handleAction = async () => {
    if (!actionDialogSitter) return;
    setProcessingId(actionDialogSitter.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/sitters/${actionDialogSitter.id}/approval`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status: actionType === 'ban' ? 'banned' : 'rejected', reason: actionReason || undefined }),
      });
      if (!res.ok) throw new Error(`Failed to ${actionType}`);
      setPendingSitters((prev) => prev.filter((s) => s.id !== actionDialogSitter.id));
      setActionDialogSitter(null);
      setActionReason('');
      fetchAll();
    } catch {
      setError(`Failed to ${actionType} sitter.`);
    } finally {
      setProcessingId(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approved</Badge>;
      case 'pending_approval': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      case 'banned': return <Badge className="bg-stone-800 text-white hover:bg-stone-800">Banned</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const SitterDetail = ({ sitter }: { sitter: AdminSitter }) => (
    <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 gap-3 text-sm">
      {sitter.bio && (
        <div className="col-span-2">
          <p className="text-xs font-medium text-stone-400 mb-1">Bio</p>
          <p className="text-stone-600">{sitter.bio}</p>
        </div>
      )}
      {sitter.years_experience != null && (
        <div>
          <p className="text-xs font-medium text-stone-400 mb-1">Experience</p>
          <p className="text-stone-700 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-emerald-600" />{sitter.years_experience} years</p>
        </div>
      )}
      {sitter.home_type && (
        <div>
          <p className="text-xs font-medium text-stone-400 mb-1">Home</p>
          <p className="text-stone-700 flex items-center gap-1">
            <Home className="w-3.5 h-3.5 text-emerald-600" />
            <span className="capitalize">{sitter.home_type}</span>
            {sitter.has_yard && <span className="text-xs text-stone-400">· yard{sitter.has_fenced_yard ? ' (fenced)' : ''}</span>}
          </p>
        </div>
      )}
      {sitter.accepted_species && sitter.accepted_species.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-400 mb-1">Accepts</p>
          <div className="flex flex-wrap gap-1">
            {sitter.accepted_species.map((s) => (
              <Badge key={s} variant="outline" className="text-xs capitalize"><PawPrint className="w-3 h-3 mr-0.5" />{s.replace('_', ' ')}</Badge>
            ))}
          </div>
        </div>
      )}
      {sitter.skills && sitter.skills.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-400 mb-1">Skills</p>
          <div className="flex flex-wrap gap-1">
            {sitter.skills.map((s) => (
              <Badge key={s} variant="outline" className="text-xs capitalize">{s.replace(/_/g, ' ')}</Badge>
            ))}
          </div>
        </div>
      )}
      {sitter.has_own_pets && sitter.own_pets_description && (
        <div className="col-span-2">
          <p className="text-xs font-medium text-stone-400 mb-1">Own Pets</p>
          <p className="text-stone-600">{sitter.own_pets_description}</p>
        </div>
      )}
      {sitter.approval_rejected_reason && (
        <div className="col-span-2">
          <p className="text-xs font-medium text-red-400 mb-1">Rejection Reason</p>
          <p className="text-red-600">{sitter.approval_rejected_reason}</p>
        </div>
      )}
    </div>
  );

  const SitterCard = ({ sitter, showActions }: { sitter: AdminSitter; showActions: boolean }) => {
    const isExpanded = expandedId === sitter.id;
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-grow">
              <img
                src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                alt={sitter.name}
                className="w-12 h-12 rounded-full border border-stone-200 flex-shrink-0"
              />
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-stone-900">{sitter.name}</p>
                  {statusBadge(sitter.approval_status)}
                </div>
                <p className="text-sm text-stone-500">{sitter.email}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  Signed up {format(new Date(sitter.created_at), 'MMM d, yyyy')}
                  {sitter.years_experience != null && ` · ${sitter.years_experience}yr exp`}
                  {sitter.accepted_species && sitter.accepted_species.length > 0 && ` · ${sitter.accepted_species.join(', ')}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setExpandedId(isExpanded ? null : sitter.id)}>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              {showActions && (
                <>
                  {sitter.approval_status !== 'approved' && sitter.approval_status !== 'banned' && (
                    <Button size="sm" onClick={() => handleApprove(sitter.id)} disabled={processingId === sitter.id}>
                      {processingId === sitter.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span className="ml-1">Approve</span>
                    </Button>
                  )}
                  {sitter.approval_status !== 'rejected' && sitter.approval_status !== 'banned' && (
                    <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => { setActionDialogSitter(sitter); setActionType('reject'); }}>
                      <X className="w-4 h-4" />
                      <span className="ml-1">Reject</span>
                    </Button>
                  )}
                  {sitter.approval_status !== 'banned' && (
                    <Button size="sm" variant="destructive" onClick={() => { setActionDialogSitter(sitter); setActionType('ban'); }}>
                      <Ban className="w-4 h-4" />
                      <span className="ml-1">Ban</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          {isExpanded && <SitterDetail sitter={sitter} />}
        </CardContent>
      </Card>
    );
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
        <Button variant={tab === 'pending' ? 'default' : 'outline'} onClick={() => setTab('pending')} size="sm">
          Pending ({pendingSitters.length})
        </Button>
        <Button variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')} size="sm">
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
              <SitterCard key={sitter.id} sitter={sitter} showActions={true} />
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
              <option value="banned">Banned</option>
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
                <SitterCard key={sitter.id} sitter={sitter} showActions={true} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Reject / Ban Dialog */}
      <AlertDialog open={actionDialogSitter !== null} onOpenChange={(open) => { if (!open) { setActionDialogSitter(null); setActionReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {actionType === 'ban' ? <Ban className="w-5 h-5 text-red-600" /> : <X className="w-5 h-5 text-red-600" />}
              {actionType === 'ban' ? 'Ban' : 'Reject'} {actionDialogSitter?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'ban'
                ? 'This will permanently ban this user from the platform. They will not be able to use any sitter features.'
                : 'This will prevent them from accepting bookings. You can re-approve later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder={actionType === 'ban' ? 'Reason for ban (required)' : 'Reason for rejection (optional)'}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleAction}
              disabled={(actionType === 'ban' && !actionReason.trim()) || processingId !== null}
            >
              {processingId ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {actionType === 'ban' ? 'Ban User' : 'Reject'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
