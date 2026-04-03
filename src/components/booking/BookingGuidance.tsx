import { Clock, CheckCircle, Eye, Star, XCircle, Bell } from 'lucide-react';
import { getBookingGuidance, type BookingGuidanceInfo } from '../../shared/booking-guidance';

const COLOR_STYLES: Record<BookingGuidanceInfo['color'], { bg: string; border: string; title: string; desc: string; icon: string }> = {
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   title: 'text-amber-800',   desc: 'text-amber-600',   icon: 'text-amber-500' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-800', desc: 'text-emerald-600', icon: 'text-emerald-500' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    title: 'text-blue-800',    desc: 'text-blue-600',    icon: 'text-blue-500' },
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  title: 'text-violet-800',  desc: 'text-violet-600',  icon: 'text-violet-500' },
  stone:   { bg: 'bg-stone-50',   border: 'border-stone-200',   title: 'text-stone-700',   desc: 'text-stone-500',   icon: 'text-stone-400' },
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  confirmed: CheckCircle,
  in_progress: Eye,
  completed: Star,
  cancelled: XCircle,
};

interface Props {
  readonly status: string;
  readonly role: 'owner' | 'sitter';
}

export default function BookingGuidance({ status, role }: Props) {
  const guidance = getBookingGuidance(status, role);
  if (!guidance.title) return null;

  const styles = COLOR_STYLES[guidance.color];
  const Icon = STATUS_ICONS[status] || Bell;

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-xl p-3 flex items-start gap-2.5 mt-3`}>
      <Icon className={`w-4 h-4 ${styles.icon} mt-0.5 flex-shrink-0`} />
      <div>
        <div className={`text-sm font-semibold ${styles.title}`}>{guidance.title}</div>
        <div className={`text-xs ${styles.desc} mt-0.5`}>{guidance.description}</div>
      </div>
    </div>
  );
}
