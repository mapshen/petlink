import { format } from 'date-fns';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TimelineItem } from '../../hooks/useTodaySchedule';

const CATEGORY_ICONS: Record<string, string> = {
  feeding: '\u{1F37D}\uFE0F',
  medication: '\u{1F48A}',
  exercise: '\u{1F3C3}',
  grooming: '\u2702\uFE0F',
  behavioral: '\u{1F9E0}',
  other: '\u{1F4DD}',
};

interface Props {
  readonly timeline: TimelineItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly isSitter: boolean;
  readonly onCompleteTask?: (taskId: number, bookingId: number, completed: boolean) => void;
}

function TimeLabel({ time }: { readonly time: Date }) {
  return (
    <div className="flex flex-col items-center w-[60px] flex-shrink-0">
      <div className="text-xs font-semibold text-stone-500">
        {format(time, 'h:mm a')}
      </div>
      <div className="flex-1 w-0.5 bg-stone-200 mt-1 min-h-[24px]" />
    </div>
  );
}

function BookingItem({ item }: { readonly item: TimelineItem }) {
  const d = item.data;
  const status = d.status as string;
  const endTime = item.endTime ? format(item.endTime, 'h:mm a') : '';

  const borderColor = status === 'in_progress' ? 'border-blue-500' : status === 'pending' ? 'border-amber-400' : 'border-emerald-500';
  const statusBadge = status === 'confirmed'
    ? { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Confirmed' }
    : status === 'pending'
    ? { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' }
    : status === 'in_progress'
    ? { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' }
    : { bg: 'bg-stone-100', text: 'text-stone-600', label: status };

  return (
    <div className={`flex-1 bg-white border border-stone-200 border-l-4 ${borderColor} rounded-xl p-3`}>
      <div className="flex justify-between items-center">
        <div>
          <div className="text-sm font-semibold">
            {(d.service_type as string)?.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            {d.pets && (d.pets as { name: string }[]).length > 0 && (
              <span className="text-stone-500 font-normal"> &middot; {(d.pets as { name: string }[]).map(p => p.name).join(', ')}</span>
            )}
          </div>
          <div className="text-xs text-stone-500">
            {d.sitter_name as string || d.owner_name as string} &middot; {format(item.time, 'h:mm a')} - {endTime}
          </div>
        </div>
        <span className={`${statusBadge.bg} ${statusBadge.text} text-[11px] font-semibold px-2.5 py-0.5 rounded-full`}>
          {statusBadge.label}
        </span>
      </div>
      {status === 'in_progress' && (
        <Link
          to={`/track/${item.id}`}
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Track Walk
        </Link>
      )}
    </div>
  );
}

function CareTaskItem({
  item,
  isSitter,
  onComplete,
}: {
  readonly item: TimelineItem;
  readonly isSitter: boolean;
  readonly onComplete?: (taskId: number, bookingId: number, completed: boolean) => void;
}) {
  const d = item.data;
  const completed = d.completed as boolean;
  const category = d.category as string;
  const icon = CATEGORY_ICONS[category] || CATEGORY_ICONS.other;
  const now = new Date();
  const isDue = item.time <= now && !completed;
  const isUpcoming = item.time > now && item.time.getTime() - now.getTime() < 30 * 60 * 1000;

  const borderColor = isDue ? 'border-amber-400' : completed ? 'border-stone-200' : 'border-violet-300';
  const bgColor = isDue ? 'bg-amber-50' : completed ? 'bg-stone-50' : 'bg-white';

  return (
    <div className={`flex-1 ${bgColor} border border-stone-200 border-l-4 ${borderColor} rounded-xl p-3`}>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <span className="text-base">{icon}</span>
          <div>
            <div className={`text-sm font-semibold ${completed ? 'line-through text-stone-400' : isDue ? 'text-amber-800' : ''}`}>
              {d.description as string}
            </div>
            <div className="text-xs text-stone-500">
              {d.pet_name as string}
              {d.notes && <span> &middot; {d.notes as string}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDue && (
            <span className="bg-amber-400 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full animate-pulse">
              Due now
            </span>
          )}
          {isUpcoming && !isDue && (
            <span className="text-xs text-stone-500">
              In {Math.round((item.time.getTime() - now.getTime()) / 60000)}m
            </span>
          )}
          {isSitter && onComplete && (
            <button
              onClick={() => onComplete(item.id, d.booking_id as number, !completed)}
              className="w-7 h-7 rounded-full border-2 border-stone-300 bg-white flex items-center justify-center hover:border-emerald-500 transition-colors"
              aria-label={completed ? 'Mark as incomplete' : 'Mark as done'}
            >
              {completed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Circle className="w-4 h-4 text-stone-300" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AvailabilityItem({ item }: { readonly item: TimelineItem }) {
  const endTime = item.endTime ? format(item.endTime, 'h:mm a') : '';
  return (
    <div className="flex-1 bg-emerald-50 border border-dashed border-emerald-300 rounded-xl p-3">
      <div className="text-sm font-semibold text-emerald-700">Available</div>
      <div className="text-xs text-emerald-500">
        {format(item.time, 'h:mm a')} - {endTime}
      </div>
    </div>
  );
}

export default function TodaySchedule({ timeline, loading, error, isSitter, onCompleteTask }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 p-6" role="status" aria-live="polite">
        <div className="flex justify-center py-4">
          <Clock className="w-5 h-5 animate-spin text-stone-400" aria-hidden="true" />
          <span className="sr-only">Loading schedule...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-center">
        <h2 className="font-bold text-base">Today's Schedule</h2>
        <span className="text-xs text-stone-500">{format(new Date(), 'EEE, MMM d')}</span>
      </div>

      {error && (
        <div role="alert" className="px-5 py-3 text-sm text-red-600 bg-red-50">{error}</div>
      )}

      {timeline.length === 0 && !error && (
        <div className="px-5 py-8 text-center text-stone-400 text-sm">
          Nothing scheduled for today
        </div>
      )}

      {timeline.length > 0 && (
        <div className="px-5 py-4 space-y-3">
          {timeline.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex gap-3">
              <TimeLabel time={item.time} />
              {item.type === 'booking' && <BookingItem item={item} />}
              {item.type === 'care_task' && (
                <CareTaskItem item={item} isSitter={isSitter} onComplete={onCompleteTask} />
              )}
              {item.type === 'availability' && <AvailabilityItem item={item} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
