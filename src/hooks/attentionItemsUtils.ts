export interface AttentionItem {
  type: 'care_task_due' | 'care_task_upcoming' | 'pending_booking' | 'pending_review' | 'pending_inquiry' | 'inquiry_offer_pending';
  urgency: number;
  id: string;
  data: Record<string, unknown>;
}

interface CareTaskLike {
  id: number;
  scheduled_time: string | null;
  completed: boolean;
  description: string;
  pet_name: string;
  category: string;
  booking_id: number;
  notes?: string | null;
}

interface BookingLike {
  id: number;
  status: string;
  sitter_id: number;
  owner_id: number;
  sitter_name?: string;
  owner_name?: string;
  service_type?: string;
  start_time: string;
}

interface InquiryLike {
  id: number;
  status: string;
  owner_id: number;
  sitter_id: number;
  owner_name?: string;
  sitter_name?: string;
  service_type?: string;
  created_at: string;
}

export function buildAttentionItems(
  careTasks: CareTaskLike[],
  bookings: BookingLike[],
  userId: number,
  isSitter: boolean,
  reviewedBookingIds: Set<number>,
  inquiries: InquiryLike[] = [],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const now = new Date();

  for (const task of careTasks) {
    if (task.completed || !task.scheduled_time) continue;
    const scheduled = new Date(task.scheduled_time);
    const diffMs = scheduled.getTime() - now.getTime();
    if (diffMs <= 0) {
      items.push({ type: 'care_task_due', urgency: 0, id: `task-${task.id}`, data: task as unknown as Record<string, unknown> });
    } else if (diffMs <= 30 * 60 * 1000) {
      items.push({ type: 'care_task_upcoming', urgency: 1, id: `task-${task.id}`, data: task as unknown as Record<string, unknown> });
    }
  }

  for (const b of bookings) {
    if (b.status !== 'pending') continue;
    if (isSitter && b.sitter_id === userId) {
      items.push({ type: 'pending_booking', urgency: 2, id: `booking-${b.id}`, data: b as unknown as Record<string, unknown> });
    } else if (!isSitter && b.owner_id === userId) {
      items.push({ type: 'pending_booking', urgency: 3, id: `booking-${b.id}`, data: b as unknown as Record<string, unknown> });
    }
  }

  if (!isSitter) {
    for (const b of bookings) {
      if (b.status === 'completed' && b.owner_id === userId && !reviewedBookingIds.has(b.id)) {
        items.push({ type: 'pending_review', urgency: 4, id: `review-${b.id}`, data: b as unknown as Record<string, unknown> });
      }
    }
  }

  // Inquiry items
  for (const inq of inquiries) {
    if (inq.status === 'open' && isSitter && inq.sitter_id === userId) {
      // Sitter has a pending inquiry to respond to
      items.push({ type: 'pending_inquiry', urgency: 2, id: `inquiry-${inq.id}`, data: inq as unknown as Record<string, unknown> });
    } else if (inq.status === 'offer_sent' && !isSitter && inq.owner_id === userId) {
      // Owner has an offer waiting for response
      items.push({ type: 'inquiry_offer_pending', urgency: 1, id: `inquiry-offer-${inq.id}`, data: inq as unknown as Record<string, unknown> });
    }
  }

  return items.sort((a, b) => a.urgency - b.urgency);
}
