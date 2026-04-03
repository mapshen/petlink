export interface BookingGuidanceInfo {
  title: string;
  description: string;
  color: 'amber' | 'emerald' | 'blue' | 'violet' | 'stone';
}

type Role = 'owner' | 'sitter';

const GUIDANCE: Record<string, Record<Role, BookingGuidanceInfo>> = {
  pending: {
    owner: {
      title: 'Waiting for sitter to respond',
      description: 'Sitters typically respond within a few hours. You\'ll get a notification when they do.',
      color: 'amber',
    },
    sitter: {
      title: 'New booking request — respond promptly',
      description: 'Review the pet\'s care instructions and confirm or decline within 24 hours. Quick responses improve your ranking.',
      color: 'amber',
    },
  },
  confirmed: {
    owner: {
      title: 'Booking confirmed! Get ready',
      description: 'Make sure your pet\'s care instructions are up to date. The sitter will review them before the session.',
      color: 'emerald',
    },
    sitter: {
      title: 'You\'re all set for this booking',
      description: 'Review the pet\'s care instructions and reach out to the owner if you have questions.',
      color: 'emerald',
    },
  },
  in_progress: {
    owner: {
      title: 'Your sitter is with your pet right now',
      description: 'You may receive photo updates during the session. Track the walk in real time.',
      color: 'blue',
    },
    sitter: {
      title: 'Session in progress — send updates',
      description: 'Send photo updates to keep the owner informed. Log events like potty breaks.',
      color: 'blue',
    },
  },
  completed: {
    owner: {
      title: 'How did it go? Leave a review',
      description: 'Your feedback helps other pet owners find great sitters. Reviews are visible after 3 days.',
      color: 'violet',
    },
    sitter: {
      title: 'Payment is processing',
      description: 'Great job! Your payout will be scheduled shortly. The owner can leave a review.',
      color: 'violet',
    },
  },
  cancelled: {
    owner: {
      title: 'This booking was cancelled',
      description: 'Any held payment has been released. You can book another sitter anytime.',
      color: 'stone',
    },
    sitter: {
      title: 'This booking was cancelled',
      description: 'The time slot is now available for other bookings.',
      color: 'stone',
    },
  },
};

const EMPTY: BookingGuidanceInfo = { title: '', description: '', color: 'stone' };

export function getBookingGuidance(status: string, role: Role): BookingGuidanceInfo {
  return GUIDANCE[status]?.[role] ?? EMPTY;
}
