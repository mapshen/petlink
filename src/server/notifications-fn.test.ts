import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before imports
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
} from './notifications.ts';

const mockedSql = mockSqlFn;

describe('createNotification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates notification when no preferences exist', async () => {
    const fakeNotification = { id: 1, user_id: 1, type: 'new_booking', title: 'Test', body: 'Body', read: false, created_at: '2026-01-01' };
    mockedSql
      .mockResolvedValueOnce([] as any)  // preferences lookup
      .mockResolvedValueOnce([fakeNotification] as any);  // insert

    const result = await createNotification(1, 'new_booking', 'Test', 'Body');
    expect(result.id).toBe(1);
    expect(result.title).toBe('Test');
  });

  it('creates notification with data payload', async () => {
    const fakeNotification = { id: 2, user_id: 1, type: 'new_booking', title: 'T', body: 'B', data: '{"booking_id":5}', read: false, created_at: '2026-01-01' };
    mockedSql
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([fakeNotification] as any);

    const result = await createNotification(1, 'new_booking', 'T', 'B', { booking_id: 5 });
    expect(result.id).toBe(2);
  });

  it('skips notification when user preference disables the type', async () => {
    const prefs = { new_booking: false, booking_status: true, new_message: true, walk_updates: true };
    mockedSql.mockResolvedValueOnce([prefs] as any);

    const result = await createNotification(1, 'new_booking', 'Test', 'Body');
    expect(result.id).toBe(0);  // Sentinel indicating skipped
    expect(mockedSql).toHaveBeenCalledTimes(1);  // Only preferences lookup, no insert
  });

  it('maps walk_started to walk_updates preference', async () => {
    const prefs = { new_booking: true, booking_status: true, new_message: true, walk_updates: false };
    mockedSql.mockResolvedValueOnce([prefs] as any);

    const result = await createNotification(1, 'walk_started', 'Walk', 'Started');
    expect(result.id).toBe(0);
  });

  it('maps walk_completed to walk_updates preference', async () => {
    const prefs = { new_booking: true, booking_status: true, new_message: true, walk_updates: false };
    mockedSql.mockResolvedValueOnce([prefs] as any);

    const result = await createNotification(1, 'walk_completed', 'Walk', 'Done');
    expect(result.id).toBe(0);
  });
});

describe('getUserNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notifications for user', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    mockedSql.mockResolvedValueOnce(rows as any);

    const result = await getUserNotifications(1);
    expect(result).toHaveLength(2);
  });
});

describe('getUnreadCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unread count', async () => {
    mockedSql.mockResolvedValueOnce([{ count: 5 }] as any);
    const count = await getUnreadCount(1);
    expect(count).toBe(5);
  });
});

describe('markAsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when notification is found and updated', async () => {
    mockedSql.mockResolvedValueOnce({ count: 1 } as any);
    const result = await markAsRead(1, 1);
    expect(result).toBe(true);
  });

  it('returns false when notification not found', async () => {
    mockedSql.mockResolvedValueOnce({ count: 0 } as any);
    const result = await markAsRead(999, 1);
    expect(result).toBe(false);
  });
});

describe('markAllAsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns count of marked notifications', async () => {
    mockedSql.mockResolvedValueOnce({ count: 3 } as any);
    const count = await markAllAsRead(1);
    expect(count).toBe(3);
  });
});

describe('getPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing preferences', async () => {
    const prefs = { user_id: 1, new_booking: false, booking_status: true, new_message: true, walk_updates: false };
    mockedSql.mockResolvedValueOnce([prefs] as any);

    const result = await getPreferences(1);
    expect(result.new_booking).toBe(false);
    expect(result.walk_updates).toBe(false);
  });

  it('returns defaults when no preferences exist', async () => {
    mockedSql.mockResolvedValueOnce([] as any);

    const result = await getPreferences(1);
    expect(result.new_booking).toBe(true);
    expect(result.booking_status).toBe(true);
    expect(result.new_message).toBe(true);
    expect(result.walk_updates).toBe(true);
  });
});

describe('updatePreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates existing preferences', async () => {
    const existing = { user_id: 1, new_booking: true, booking_status: true, new_message: true, walk_updates: true };
    mockedSql
      .mockResolvedValueOnce([existing] as any)  // check existing
      .mockResolvedValueOnce(undefined as any)    // update
      .mockResolvedValueOnce([{ ...existing, new_booking: false }] as any);  // getPreferences

    const result = await updatePreferences(1, { new_booking: false });
    expect(result.new_booking).toBe(false);
  });

  it('inserts new preferences when none exist', async () => {
    const newPrefs = { user_id: 1, new_booking: true, booking_status: true, new_message: false, walk_updates: true };
    mockedSql
      .mockResolvedValueOnce([] as any)    // check existing (none)
      .mockResolvedValueOnce(undefined as any)  // insert
      .mockResolvedValueOnce([newPrefs] as any);  // getPreferences

    const result = await updatePreferences(1, { new_message: false });
    expect(result.new_message).toBe(false);
  });
});
