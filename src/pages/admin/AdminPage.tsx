import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../../config';
import { Shield, Check, X, Ban, Loader2, Users, Home, PawPrint, Award, ChevronDown, ChevronUp, Scale } from 'lucide-react';
import AdminDisputeQueue from '../../components/dispute/AdminDisputeQueue';
import AdminReviewReports from '../../components/review/AdminReviewReports';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
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
  reference_count?: number;
  manual_import_count?: number;
}

type Tab = 'pending' | 'approved' | 'rejected' | 'banned' | 'all' | 'disputes' | 'flagged_reviews' | 'beta_credits';
type ActionType = 'reject' | 'ban';
type BetaCohort = 'founding' | 'early_beta' | 'post_beta';

const COHORT_OPTIONS: { value: BetaCohort; label: string; min: number; max: number; default: number }[] = [
  { value: 'founding', label: 'Founding Sitter ($120-$240)', min: 12000, max: 24000, default: 12000 },
  { value: 'early_beta', label: 'Early Beta ($60-$120)', min: 6000, max: 12000, default: 6000 },
  { value: 'post_beta', label: 'Post Beta ($20-$40)', min: 2000, max: 4000, default: 2000 },
];

export default function AdminPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get('tab') as Tab) || 'pending';
  const [pendingSitters, setPendingSitters] = useState<AdminSitter[]>([]);
  const [allSitters, setAllSitters] = useState<AdminSitter[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [actionDialogSitter, setActionDialogSitter] = useState<AdminSitter | null>(null);
  const [actionType, setActionType] = useState<ActionType>('reject');
  const [actionReason, setActionReason] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const statusFilter = tab === 'all' || tab === 'pending' ? '' : tab === 'approved' ? 'approved' : tab === 'rejected' ? 'rejected' : tab === 'banned' ? 'banned' : '';

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
    if (!user?.is_admin) return;
    fetchPending();
    fetchAll();
  }, [token, tab]);

  if (authLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }
  if (!user?.is_admin) {
    return <Navigate to="/home" replace />;
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
      {((sitter.reference_count ?? 0) > 0 || (sitter.manual_import_count ?? 0) > 0) && (
        <div className="col-span-2">
          <p className="text-xs font-medium text-stone-400 mb-1">Social Proof</p>
          <div className="flex gap-3">
            {(sitter.reference_count ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50">
                {sitter.reference_count} client reference{sitter.reference_count !== 1 ? 's' : ''}
              </Badge>
            )}
            {(sitter.manual_import_count ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs text-blue-700 border-blue-200 bg-blue-50">
                {sitter.manual_import_count} imported review{sitter.manual_import_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
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

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'pending', label: `Pending (${pendingSitters.length})` },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'banned', label: 'Banned' },
          { key: 'all', label: `All (${allTotal})` },
          { key: 'disputes', label: 'Disputes' },
          { key: 'flagged_reviews', label: 'Flagged Reviews' },
          { key: 'beta_credits', label: 'Beta Credits' },
        ] as const).map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'default' : 'outline'}
            onClick={() => setSearchParams({ tab: t.key })}
            size="sm"
          >
            {t.label}
          </Button>
        ))}
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

      {tab !== 'pending' && tab !== 'disputes' && tab !== 'flagged_reviews' && tab !== 'beta_credits' && (
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
      )}

      {tab === 'disputes' && (
        <AdminDisputeQueue token={token} currentUserId={user?.id} />
      )}

      {tab === 'flagged_reviews' && (
        <AdminReviewReports token={token} />
      )}

      {tab === 'beta_credits' && (
        <BetaCreditPanel token={token} sitters={allSitters} onRefresh={fetchAll} />
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

function BetaCreditPanel({ token, sitters, onRefresh }: { token: string | null; sitters: AdminSitter[]; onRefresh: () => void }) {
  const [selectedSitter, setSelectedSitter] = useState<number | ''>('');
  const [cohort, setCohort] = useState<BetaCohort>('founding');
  const [amount, setAmount] = useState(12000);
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  const cohortConfig = COHORT_OPTIONS.find(c => c.value === cohort)!;

  const handleCohortChange = (newCohort: BetaCohort) => {
    setCohort(newCohort);
    const config = COHORT_OPTIONS.find(c => c.value === newCohort)!;
    setAmount(config.default);
  };

  const handleIssue = async () => {
    if (!selectedSitter) return;
    setIssuing(true);
    setIssueError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${selectedSitter}/beta-credit`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amount, cohort }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(`Issued $${(amount / 100).toFixed(2)} to sitter #${selectedSitter}${data.founding_sitter ? ' (Founding Sitter badge granted)' : ''}`);
        setSelectedSitter('');
        onRefresh();
      } else {
        const data = await res.json();
        setIssueError(data.error || 'Failed to issue credits');
      }
    } catch {
      setIssueError('Network error');
    } finally {
      setIssuing(false);
    }
  };

  const approvedSitters = sitters.filter(s => s.approval_status === 'approved');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-stone-900">Issue Beta Credits</h3>

          {result && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <AlertDescription className="text-emerald-800">{result}</AlertDescription>
            </Alert>
          )}
          {issueError && (
            <Alert variant="destructive">
              <AlertDescription>{issueError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Sitter</label>
              <select
                value={selectedSitter}
                onChange={e => setSelectedSitter(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select a sitter...</option>
                {approvedSitters.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Cohort</label>
              <select
                value={cohort}
                onChange={e => handleCohortChange(e.target.value as BetaCohort)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              >
                {COHORT_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Amount (${(amount / 100).toFixed(2)})
              </label>
              <input
                type="range"
                min={cohortConfig.min}
                max={cohortConfig.max}
                step={100}
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
                className="w-full"
                aria-label="Credit amount"
              />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>${(cohortConfig.min / 100).toFixed(0)}</span>
                <span>${(cohortConfig.max / 100).toFixed(0)}</span>
              </div>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleIssue}
                disabled={!selectedSitter || issuing}
                className="w-full"
              >
                {issuing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Issue ${(amount / 100).toFixed(2)} Credits
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
