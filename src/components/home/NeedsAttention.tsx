import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import type { AttentionItem } from '../../hooks/attentionItemsUtils';

const CATEGORY_ICONS: Record<string, string> = {
  feeding: '\u{1F37D}\uFE0F',
  medication: '\u{1F48A}',
  exercise: '\u{1F3C3}',
  grooming: '\u2702\uFE0F',
  behavioral: '\u{1F9E0}',
  other: '\u{1F4DD}',
};

interface Props {
  readonly items: AttentionItem[];
  readonly isSitter: boolean;
  readonly onAcceptBooking?: (bookingId: number) => void;
  readonly onDeclineBooking?: (bookingId: number) => void;
  readonly onCompleteTask?: (taskId: number, bookingId: number, completed: boolean) => void;
}

function CareTaskDueItem({
  item,
  isSitter,
  onComplete,
}: {
  readonly item: AttentionItem;
  readonly isSitter: boolean;
  readonly onComplete?: (taskId: number, bookingId: number, completed: boolean) => void;
}) {
  const d = item.data;
  const icon = CATEGORY_ICONS[d.category as string] || CATEGORY_ICONS.other;
  const isDue = item.type === 'care_task_due';

  return (
    <div className={`px-5 py-3 border-b border-amber-200 flex items-center gap-3 ${isDue ? 'bg-amber-50' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${isDue ? 'bg-amber-400 animate-pulse' : 'bg-amber-100'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${isDue ? 'text-amber-800' : 'text-stone-900'}`}>
          {d.pet_name as string}'s {d.description as string}
          {isDue ? ' \u2014 due now' : ''}
        </div>
        <div className="text-xs text-amber-700">
          {d.category as string}
          {d.notes && <span> &middot; {d.notes as string}</span>}
          {d.scheduled_time && <span> &middot; {format(new Date(d.scheduled_time as string), 'h:mm a')}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isDue && (
          <span className="bg-amber-400 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">Due now</span>
        )}
        {!isDue && d.scheduled_time && (
          <span className="text-xs text-stone-500">
            In {Math.max(1, Math.round((new Date(d.scheduled_time as string).getTime() - Date.now()) / 60000))}m
          </span>
        )}
        {isSitter && onComplete && (
          <button
            onClick={() => onComplete(d.id as number, d.booking_id as number, true)}
            className="w-7 h-7 rounded-full border-2 border-stone-300 bg-white flex items-center justify-center hover:border-emerald-500 transition-colors"
            aria-label="Mark as done"
          >
            <Circle className="w-4 h-4 text-stone-300" />
          </button>
        )}
      </div>
    </div>
  );
}

function PendingBookingItem({
  item,
  isSitter,
  onAccept,
  onDecline,
}: {
  readonly item: AttentionItem;
  readonly isSitter: boolean;
  readonly onAccept?: (bookingId: number) => void;
  readonly onDecline?: (bookingId: number) => void;
}) {
  const d = item.data;
  const counterparty = isSitter ? (d.owner_name as string) : (d.sitter_name as string);
  const serviceType = (d.service_type as string)?.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">{'\u{1F514}'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">
          {isSitter ? 'New booking request' : 'Booking awaiting response'}
        </div>
        <div className="text-xs text-amber-700">
          {counterparty} &middot; {serviceType}
          {d.start_time && <span> &middot; {format(new Date(d.start_time as string), 'MMM d, h:mm a')}</span>}
        </div>
      </div>
      {isSitter && onAccept && onDecline && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onAccept(d.id as number)}
            className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onDecline(d.id as number)}
            className="bg-white text-red-700 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Decline
          </button>
        </div>
      )}
      {!isSitter && (
        <span className="text-xs text-amber-600 font-medium">Pending</span>
      )}
    </div>
  );
}

function PendingReviewItem({ item }: { readonly item: AttentionItem }) {
  const d = item.data;
  return (
    <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">{'\u2B50'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Leave a review</div>
        <div className="text-xs text-amber-700">
          {d.sitter_name as string}
          {d.start_time && <span> &middot; {format(new Date(d.start_time as string), 'MMM d')}</span>}
        </div>
      </div>
      <span className="text-xs text-emerald-600 font-semibold cursor-pointer hover:underline">Review</span>
    </div>
  );
}

export default function NeedsAttention({ items, isSitter, onAcceptBooking, onDeclineBooking, onCompleteTask }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl overflow-hidden mb-6" role="region" aria-label="Items needing attention">
      <div className="px-5 py-3 border-b border-amber-300 flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="font-bold text-sm text-amber-800">Needs Attention</span>
        <span className="bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-1">{items.length}</span>
      </div>
      {items.map((item) => {
        if (item.type === 'care_task_due' || item.type === 'care_task_upcoming') {
          return <CareTaskDueItem key={item.id} item={item} isSitter={isSitter} onComplete={onCompleteTask} />;
        }
        if (item.type === 'pending_booking') {
          return <PendingBookingItem key={item.id} item={item} isSitter={isSitter} onAccept={onAcceptBooking} onDecline={onDeclineBooking} />;
        }
        if (item.type === 'pending_review') {
          return <PendingReviewItem key={item.id} item={item} />;
        }
        return null;
      })}
    </div>
  );
}
