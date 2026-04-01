import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Calendar, Loader2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useBookingHistory, type BookingHistoryItem } from '../../hooks/useBookingHistory';
import { useAuth } from '../../context/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import BookingReviewDetail from '../review/BookingReviewDetail';
import { formatCents } from '../../lib/money';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-100 text-emerald-700';
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-stone-100 text-stone-600';
    case 'cancelled':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

export function formatBookingDate(isoDate: string): string {
  return format(new Date(isoDate), 'MMM d, yyyy');
}

function formatServiceType(type: string | null): string {
  if (!type) return '-';
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrencyCents(amountCents: number | null): string {
  if (amountCents === null || amountCents === undefined) return '-';
  return formatCents(amountCents);
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BookingRowProps {
  readonly booking: BookingHistoryItem;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly userId: number;
  readonly token: string | null;
  readonly onLeaveReview?: (bookingId: number) => void;
}

function BookingRow({ booking, expanded, onToggle, userId, token, onLeaveReview }: BookingRowProps) {
  const isCompleted = booking.status === 'completed';

  return (
    <>
      <tr
        className={`border-b border-stone-100 hover:bg-stone-50 transition-colors ${isCompleted ? 'cursor-pointer' : ''}`}
        onClick={isCompleted ? onToggle : undefined}
      >
        <td className="px-4 py-3 text-xs text-stone-700 whitespace-nowrap">
          {formatBookingDate(booking.start_time)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 border border-stone-200">
              <AvatarImage src={booking.owner_avatar || undefined} alt={booking.owner_name || 'Customer'} />
              <AvatarFallback className="text-[10px]">
                {booking.owner_name?.charAt(0)?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-stone-700 truncate max-w-[120px]">
              {booking.owner_name || 'Unknown'}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-stone-600 capitalize whitespace-nowrap">
          {formatServiceType(booking.service_type)}
        </td>
        <td className="px-4 py-3 text-xs text-stone-500 truncate max-w-[150px]">
          {booking.pets.length > 0 ? booking.pets.map((p) => p.name).join(', ') : '-'}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadgeClasses(booking.status)}`}>
            {formatStatusLabel(booking.status)}
          </span>
        </td>
        <td className="px-4 py-3 text-xs font-medium text-stone-800 text-right whitespace-nowrap">
          {formatCurrencyCents(booking.total_price_cents)}
        </td>
        <td className="px-4 py-3 text-center">
          {isCompleted ? (
            <ChevronDown className={`w-3.5 h-3.5 text-stone-400 inline-block transition-transform ${expanded ? 'rotate-180' : ''}`} />
          ) : (
            <span className="text-[10px] text-stone-300">—</span>
          )}
        </td>
      </tr>
      {expanded && isCompleted && (
        <tr className="bg-stone-50/50 border-b border-stone-100">
          <td colSpan={7} className="px-4 py-0">
            <div className="py-4 pl-8 pr-4">
              <BookingReviewDetail
                bookingId={booking.id}
                userId={userId}
                token={token}
                onLeaveReview={onLeaveReview}
                compact
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function BookingHistory() {
  const { user, token } = useAuth();
  const {
    bookings,
    total,
    loading,
    error,
    filters,
    setStartDate,
    setEndDate,
    setStatus,
    setSearch,
    setPage,
  } = useBookingHistory();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { page, limit, search, startDate, endDate, status } = filters;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const showingTo = Math.min(page * limit, total);


  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="border-b border-stone-100 px-6 py-4 bg-stone-50">
        <h2 className="font-bold text-stone-700">Booking History</h2>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-stone-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="bh-start" className="text-xs text-stone-500">From</label>
            <input
              id="bh-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="bh-end" className="text-xs text-stone-500">To</label>
            <input
              id="bh-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-stone-300 rounded-lg pl-7 pr-2 py-1.5 text-xs bg-white w-44"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="px-6 py-4 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-12 text-center text-stone-500">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-stone-300" />
          <p className="text-sm">No bookings found.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-stone-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-stone-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-stone-500 uppercase tracking-wider">Service</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-stone-500 uppercase tracking-wider">Pets</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-stone-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-center text-[10px] font-medium text-stone-500 uppercase tracking-wider">Review</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    expanded={expandedId === booking.id}
                    onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
                    userId={user?.id ?? 0}
                    token={token}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-3 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-500">
              Showing {showingFrom}-{showingTo} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
