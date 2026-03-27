import React, { useEffect, useState, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import { Shield, UserCheck, UserX, Users, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

interface AdminSitter {
  id: number;
  email: string;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  approval_status: 'pending_approval' | 'approved' | 'rejected';
  approval_rejected_reason?: string | null;
}

const PAGE_SIZE = 20;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'pending_approval':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-stone-100 text-stone-800 border-stone-200';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_approval':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

export default function AdminPage() {
  const { user, token } = useAuth();
  const [pendingSitters, setPendingSitters] = useState<AdminSitter[]>([]);
  const [allSitters, setAllSitters] = useState<AdminSitter[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [allSittersOffset, setAllSittersOffset] = useState(0);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<Set<number>>(new Set());
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchPendingSitters = useCallback(async () => {
    if (!token) return;
    setLoadingPending(true);
    try {
      const res = await fetch(`${API_BASE}/admin/pending-sitters?limit=50&offset=0`, {
        headers: getAuthHeaders(token),
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error('Failed to load pending sitters');
      const data = await res.json();
      setPendingSitters(data.sitters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending sitters');
    } finally {
      setLoadingPending(false);
    }
  }, [token]);

  const fetchAllSitters = useCallback(async () => {
    if (!token) return;
    setLoadingAll(true);
    try {
      const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const res = await fetch(
        `${API_BASE}/admin/sitters?limit=${PAGE_SIZE}&offset=${allSittersOffset}${statusParam}`,
        { headers: getAuthHeaders(token) }
      );
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error('Failed to load sitters');
      const data = await res.json();
      setAllSitters(data.sitters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sitters');
    } finally {
      setLoadingAll(false);
    }
  }, [token, statusFilter, allSittersOffset]);

  useEffect(() => {
    fetchPendingSitters();
  }, [fetchPendingSitters]);

  useEffect(() => {
    fetchAllSitters();
  }, [fetchAllSitters]);

  const handleApproval = async (sitterId: number, action: 'approve' | 'reject', reason?: string) => {
    if (!token) return;
    setActionInProgress((prev) => new Set([...prev, sitterId]));
    setError(null);
    try {
      const body: Record<string, string> = { action };
      if (reason) {
        body.reason = reason;
      }
      const res = await fetch(`${API_BASE}/admin/sitters/${sitterId}/approval`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update sitter approval');
      }

      // Refresh both lists
      await Promise.all([fetchPendingSitters(), fetchAllSitters()]);
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update approval');
    } finally {
      setActionInProgress((prev) => {
        const next = new Set(prev);
        next.delete(sitterId);
        return next;
      });
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-stone-500">Please log in to access the admin panel.</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-stone-300" />
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Access Denied</h1>
        <p className="text-stone-500">You do not have admin permissions to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-emerald-600" />
        <h1 className="text-3xl font-bold text-stone-900">Admin Dashboard</h1>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pending Approval Section */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-stone-900">Pending Approval</h2>
          {!loadingPending && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
              {pendingSitters.length}
            </Badge>
          )}
        </div>

        {loadingPending ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : pendingSitters.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center">
            <UserCheck className="w-12 h-12 mx-auto mb-3 text-stone-300" />
            <p className="text-stone-500">No sitters pending approval.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingSitters.map((sitter) => (
              <div
                key={sitter.id}
                className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6"
              >
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                      alt={sitter.name}
                    />
                    <AvatarFallback>{sitter.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-stone-900 truncate">{sitter.name}</h3>
                    <p className="text-sm text-stone-500 truncate">{sitter.email}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      Joined {format(new Date(sitter.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>

                {rejectingId === sitter.id ? (
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Reason for rejection (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionInProgress.has(sitter.id)}
                        onClick={() => handleApproval(sitter.id, 'reject', rejectReason)}
                        className="flex-1"
                      >
                        {actionInProgress.has(sitter.id) ? 'Rejecting...' : 'Confirm Reject'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={actionInProgress.has(sitter.id)}
                      onClick={() => handleApproval(sitter.id, 'approve')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <UserCheck className="w-4 h-4 mr-1" />
                      {actionInProgress.has(sitter.id) ? 'Approving...' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionInProgress.has(sitter.id)}
                      onClick={() => setRejectingId(sitter.id)}
                      className="flex-1"
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All Sitters Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-stone-600" />
            <h2 className="text-xl font-bold text-stone-900">All Sitters</h2>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => { setStatusFilter(value); setAllSittersOffset(0); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_approval">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loadingAll ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : allSitters.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-stone-300" />
            <p className="text-stone-500">No sitters found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left px-6 py-3 font-medium text-stone-600">Sitter</th>
                    <th className="text-left px-6 py-3 font-medium text-stone-600">Email</th>
                    <th className="text-left px-6 py-3 font-medium text-stone-600">Joined</th>
                    <th className="text-left px-6 py-3 font-medium text-stone-600">Status</th>
                    <th className="text-right px-6 py-3 font-medium text-stone-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {allSitters.map((sitter) => (
                    <tr key={sitter.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                              alt={sitter.name}
                            />
                            <AvatarFallback>{sitter.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-stone-900">{sitter.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-stone-500">{sitter.email}</td>
                      <td className="px-6 py-4 text-stone-500">
                        {format(new Date(sitter.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(sitter.approval_status)}`}>
                          {statusLabel(sitter.approval_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {sitter.approval_status === 'pending_approval' && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={actionInProgress.has(sitter.id)}
                              onClick={() => handleApproval(sitter.id, 'approve')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={actionInProgress.has(sitter.id)}
                              onClick={() => handleApproval(sitter.id, 'reject')}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                        {sitter.approval_status === 'rejected' && sitter.approval_rejected_reason && (
                          <span className="text-xs text-stone-400" title={sitter.approval_rejected_reason}>
                            Reason: {sitter.approval_rejected_reason.length > 30
                              ? `${sitter.approval_rejected_reason.slice(0, 30)}...`
                              : sitter.approval_rejected_reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-stone-100 bg-stone-50">
              <Button
                size="sm"
                variant="outline"
                disabled={allSittersOffset === 0}
                onClick={() => setAllSittersOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-stone-500">
                Showing {allSittersOffset + 1}–{allSittersOffset + allSitters.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={allSitters.length < PAGE_SIZE}
                onClick={() => setAllSittersOffset((prev) => prev + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
