import React from 'react';
import { format, parseISO } from 'date-fns';
import { X, Plus, Trash2, Clock, User, Check, XCircle } from 'lucide-react';
import { CalendarEvent } from '../../types';

interface DayDetailProps {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onAddAvailability: (date: Date) => void;
  onDeleteAvailability: (availabilityId: number) => void;
  onBookingAction: (bookingId: number, action: 'confirm' | 'cancel') => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-stone-100 text-stone-600',
    cancelled: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || 'bg-stone-100 text-stone-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatTimeRange(start: string, end: string): string {
  return `${format(parseISO(start), 'h:mm a')} – ${format(parseISO(end), 'h:mm a')}`;
}

function getBorderColor(status?: string): string {
  switch (status) {
    case 'confirmed': return 'border-l-emerald-500';
    case 'pending': return 'border-l-amber-500';
    case 'in_progress': return 'border-l-blue-500';
    case 'completed': return 'border-l-stone-400';
    case 'cancelled': return 'border-l-red-400';
    default: return 'border-l-stone-300';
  }
}

function BookingCard({
  event,
  onBookingAction,
}: {
  event: CalendarEvent;
  onBookingAction: (bookingId: number, action: 'confirm' | 'cancel') => void;
}) {
  const borderColor = getBorderColor(event.status);

  return (
    <div className={`rounded-xl border border-stone-200 border-l-4 ${borderColor} p-3 bg-white shadow-sm`}>
      {/* Title + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-stone-800 leading-tight">{event.title}</p>
        {event.status && <StatusBadge status={event.status} />}
      </div>

      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-2">
        <Clock size={12} className="shrink-0" />
        <span>{formatTimeRange(event.start, event.end)}</span>
      </div>

      {/* Pet names */}
      {event.pet_names && event.pet_names.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {event.pet_names.map((name) => (
            <span
              key={name}
              className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Owner */}
      {event.owner_name && (
        <div className="flex items-center gap-1.5 mb-2">
          {event.owner_avatar ? (
            <img
              src={event.owner_avatar}
              alt={event.owner_name}
              className="w-5 h-5 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
              <User size={10} className="text-stone-500" />
            </div>
          )}
          <span className="text-xs text-stone-500">{event.owner_name}</span>
        </div>
      )}

      {/* Actions for pending bookings */}
      {event.status === 'pending' && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={() => onBookingAction(event.id, 'confirm')}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg py-1.5 px-3"
          >
            <Check size={12} />
            Accept
          </button>
          <button
            type="button"
            onClick={() => onBookingAction(event.id, 'cancel')}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors rounded-lg py-1.5 px-3"
          >
            <XCircle size={12} />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function AvailabilityCard({
  event,
  onDeleteAvailability,
}: {
  event: CalendarEvent;
  onDeleteAvailability: (availabilityId: number) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-emerald-300 p-3 bg-emerald-50/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-emerald-700">Available</p>
            {event.recurring && (
              <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                Recurring
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Clock size={12} className="shrink-0" />
            <span>{formatTimeRange(event.start, event.end)}</span>
          </div>
        </div>
        {event.availability_id !== undefined && (
          <button
            type="button"
            onClick={() => onDeleteAvailability(event.availability_id!)}
            className="shrink-0 p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete availability"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAddAvailability, date }: { onAddAvailability: (date: Date) => void; date: Date }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
        <Clock size={20} className="text-stone-400" />
      </div>
      <p className="text-sm font-medium text-stone-600 mb-1">No events scheduled</p>
      <p className="text-xs text-stone-400 mb-4">Add your availability to get bookings</p>
      <button
        type="button"
        onClick={() => onAddAvailability(date)}
        className="flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg py-2 px-4"
      >
        <Plus size={14} />
        Add Availability
      </button>
    </div>
  );
}

export default function DayDetail({
  date,
  events,
  onClose,
  onAddAvailability,
  onDeleteAvailability,
  onBookingAction,
}: DayDetailProps) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100 shrink-0">
        <div>
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">
            {format(date, 'EEEE')}
          </p>
          <p className="text-base font-semibold text-stone-800">
            {format(date, 'MMMM d, yyyy')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Add Availability Button */}
      <div className="px-4 py-2 shrink-0">
        <button
          type="button"
          onClick={() => onAddAvailability(date)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 transition-colors rounded-lg py-2"
        >
          <Plus size={14} />
          Add Availability
        </button>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {sortedEvents.length === 0 ? (
          <EmptyState onAddAvailability={onAddAvailability} date={date} />
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            {sortedEvents.map((event) =>
              event.type === 'availability' ? (
                <AvailabilityCard
                  key={`avail-${event.id}`}
                  event={event}
                  onDeleteAvailability={onDeleteAvailability}
                />
              ) : (
                <BookingCard
                  key={`booking-${event.id}`}
                  event={event}
                  onBookingAction={onBookingAction}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden md:flex flex-col w-80 border-l border-stone-200 bg-white h-full overflow-hidden">
        {content}
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl border-t border-stone-200 max-h-[70vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>
        {content}
      </div>
    </>
  );
}
