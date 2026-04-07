import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockSendEmail, mockBuildReviewReminderEmail, mockCreateNotification } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  (sqlFn as any).unsafe = vi.fn((s: string) => s);
  return {
    mockSqlFn: sqlFn,
    mockSendEmail: vi.fn().mockResolvedValue({ id: 'msg_123' }),
    mockBuildReviewReminderEmail: vi.fn(() => ({ subject: 'Review reminder', html: '<p>remind</p>' })),
    mockCreateNotification: vi.fn().mockResolvedValue({ id: 1 }),
  };
});

vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./email.ts', () => ({
  sendEmail: mockSendEmail,
  buildReviewReminderEmail: mockBuildReviewReminderEmail,
  escapeHtml: vi.fn((s: string) => s),
}));
vi.mock('./notifications.ts', () => ({
  createNotification: mockCreateNotification,
}));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { checkReviewReminders } from './review-reminders.ts';

describe('review reminders scheduler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends reminder for completed booking without review after 24h', async () => {
    // Find eligible bookings
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 10,
        owner_id: 1,
        sitter_id: 2,
        owner_name: 'Alice',
        owner_email: 'alice@example.com',
        sitter_name: 'Bob',
        service_type: 'walking',
      },
    ]);
    // Prior review count
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
    // Notification preferences query
    mockSqlFn.mockResolvedValueOnce([null]);
    // Mark as sent
    mockSqlFn.mockResolvedValueOnce([]);

    const count = await checkReviewReminders();
    expect(count).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      1,
      'booking_status',
      'How was your booking?',
      expect.stringContaining('Bob'),
      { booking_id: 10 }
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockBuildReviewReminderEmail).toHaveBeenCalledWith({
      ownerName: 'Alice',
      sitterName: 'Bob',
      serviceName: 'walking',
      bookingId: 10,
      creditAmountCents: 200,
      isFirstReview: true,
      firstReviewBonusCents: 500,
    });
  });

  it('skips bookings that already have review_reminder_sent_at', async () => {
    // The SQL query filters out reminded bookings, so empty result = no sends
    mockSqlFn.mockResolvedValueOnce([]);

    const count = await checkReviewReminders();
    expect(count).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('skips email when notification preferences disable it', async () => {
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 11,
        owner_id: 1,
        sitter_id: 2,
        owner_name: 'Alice',
        owner_email: 'alice@example.com',
        sitter_name: 'Bob',
        service_type: 'sitting',
      },
    ]);
    // Prior review count
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
    // Preferences: email disabled
    mockSqlFn.mockResolvedValueOnce([{ booking_reminders_email: false, email_enabled: false }]);
    // Mark as sent
    mockSqlFn.mockResolvedValueOnce([]);

    const count = await checkReviewReminders();
    expect(count).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('still marks as sent even if email fails', async () => {
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 12,
        owner_id: 1,
        sitter_id: 2,
        owner_name: 'Alice',
        owner_email: 'alice@example.com',
        sitter_name: 'Bob',
        service_type: 'drop-in',
      },
    ]);
    // Prior review count
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
    // Notification preferences
    mockSqlFn.mockResolvedValueOnce([null]);
    mockSendEmail.mockRejectedValueOnce(new Error('email failed'));
    // Mark as sent
    mockSqlFn.mockResolvedValueOnce([]);

    const count = await checkReviewReminders();
    expect(count).toBe(1);
    // 4 sql calls: find bookings, prior count, prefs, mark sent
    expect(mockSqlFn).toHaveBeenCalledTimes(4);
  });

  it('handles multiple bookings in one run', async () => {
    mockSqlFn.mockResolvedValueOnce([
      { id: 20, owner_id: 1, sitter_id: 2, owner_name: 'A', owner_email: 'a@x.com', sitter_name: 'B', service_type: 'walking' },
      { id: 21, owner_id: 3, sitter_id: 4, owner_name: 'C', owner_email: 'c@x.com', sitter_name: 'D', service_type: 'sitting' },
    ]);
    // Booking 20: prior count + prefs + mark
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
    mockSqlFn.mockResolvedValueOnce([null]);
    mockSqlFn.mockResolvedValueOnce([]);
    // Booking 21: prior count + prefs + mark
    mockSqlFn.mockResolvedValueOnce([{ count: 2 }]);
    mockSqlFn.mockResolvedValueOnce([null]);
    mockSqlFn.mockResolvedValueOnce([]);

    const count = await checkReviewReminders();
    expect(count).toBe(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it('does not crash when main query throws', async () => {
    mockSqlFn.mockRejectedValueOnce(new Error('db down'));

    const count = await checkReviewReminders();
    expect(count).toBe(0);
  });
});
