import db from './db.ts';

export interface Notification {
  id: number;
  user_id: number;
  type: 'new_booking' | 'booking_status' | 'new_message' | 'walk_started' | 'walk_completed';
  title: string;
  body: string;
  data?: string; // JSON string for extra payload
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: number;
  new_booking: boolean;
  booking_status: boolean;
  new_message: boolean;
  walk_updates: boolean;
}

export function createNotification(
  userId: number,
  type: Notification['type'],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Notification {
  // Check user preferences
  const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;

  if (prefs) {
    const prefMap: Record<string, string> = {
      new_booking: 'new_booking',
      booking_status: 'booking_status',
      new_message: 'new_message',
      walk_started: 'walk_updates',
      walk_completed: 'walk_updates',
    };
    const prefKey = prefMap[type];
    if (prefKey && !prefs[prefKey]) {
      // User has disabled this notification type — skip
      return { id: 0, user_id: userId, type, title, body, read: false, created_at: new Date().toISOString() };
    }
  }

  const dataStr = data ? JSON.stringify(data) : null;
  const info = db.prepare(
    'INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, title, body, dataStr);

  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid) as Notification;
}

export function getUserNotifications(userId: number, limit = 50, offset = 0): Notification[] {
  return db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(userId, limit, offset) as Notification[];
}

export function getUnreadCount(userId: number): number {
  const row = db.prepare('SELECT count(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(userId) as { count: number };
  return row.count;
}

export function markAsRead(notificationId: number, userId: number): boolean {
  const info = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
  return info.changes > 0;
}

export function markAllAsRead(userId: number): number {
  const info = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
  return info.changes;
}

export function getPreferences(userId: number): NotificationPreferences {
  const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as NotificationPreferences | undefined;
  if (prefs) return prefs;
  // Return defaults (all enabled)
  return { user_id: userId, new_booking: true, booking_status: true, new_message: true, walk_updates: true };
}

export function updatePreferences(userId: number, prefs: Partial<Omit<NotificationPreferences, 'user_id'>>): NotificationPreferences {
  const existing = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`
      UPDATE notification_preferences
      SET new_booking = COALESCE(?, new_booking),
          booking_status = COALESCE(?, booking_status),
          new_message = COALESCE(?, new_message),
          walk_updates = COALESCE(?, walk_updates)
      WHERE user_id = ?
    `).run(
      prefs.new_booking != null ? (prefs.new_booking ? 1 : 0) : null,
      prefs.booking_status != null ? (prefs.booking_status ? 1 : 0) : null,
      prefs.new_message != null ? (prefs.new_message ? 1 : 0) : null,
      prefs.walk_updates != null ? (prefs.walk_updates ? 1 : 0) : null,
      userId
    );
  } else {
    db.prepare(
      'INSERT INTO notification_preferences (user_id, new_booking, booking_status, new_message, walk_updates) VALUES (?, ?, ?, ?, ?)'
    ).run(
      userId,
      prefs.new_booking != null ? (prefs.new_booking ? 1 : 0) : 1,
      prefs.booking_status != null ? (prefs.booking_status ? 1 : 0) : 1,
      prefs.new_message != null ? (prefs.new_message ? 1 : 0) : 1,
      prefs.walk_updates != null ? (prefs.walk_updates ? 1 : 0) : 1
    );
  }
  return getPreferences(userId);
}
