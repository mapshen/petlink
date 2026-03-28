import sql from './db.ts';

export interface Notification {
  id: number;
  user_id: number;
  type: 'new_booking' | 'booking_status' | 'new_message' | 'walk_started' | 'walk_completed';
  title: string;
  body: string;
  data?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: number;
  new_booking: boolean;
  booking_status: boolean;
  new_message: boolean;
  walk_updates: boolean;
  email_enabled: boolean;
}

export async function createNotification(
  userId: number,
  type: Notification['type'],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<Notification> {
  // Check user preferences
  const [prefs] = await sql`SELECT * FROM notification_preferences WHERE user_id = ${userId}`;

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
      return { id: 0, user_id: userId, type, title, body, read: false, created_at: new Date().toISOString() };
    }
  }

  const dataStr = data ? JSON.stringify(data) : null;
  const [notification] = await sql`
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (${userId}, ${type}, ${title}, ${body}, ${dataStr})
    RETURNING *
  `;

  return notification as unknown as Notification;
}

export async function getUserNotifications(userId: number, limit = 50, offset = 0): Promise<Notification[]> {
  const rows = await sql`
    SELECT * FROM notifications WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
  return rows as unknown as Notification[];
}

export async function getUnreadCount(userId: number): Promise<number> {
  const [{ count }] = await sql`SELECT count(*)::int as count FROM notifications WHERE user_id = ${userId} AND read = false`;
  return count;
}

export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  const result = await sql`UPDATE notifications SET read = true WHERE id = ${notificationId} AND user_id = ${userId}`;
  return result.count > 0;
}

export async function markAllAsRead(userId: number): Promise<number> {
  const result = await sql`UPDATE notifications SET read = true WHERE user_id = ${userId} AND read = false`;
  return result.count;
}

export async function getPreferences(userId: number): Promise<NotificationPreferences> {
  const [prefs] = await sql`SELECT * FROM notification_preferences WHERE user_id = ${userId}`;
  if (prefs) return prefs as unknown as NotificationPreferences;
  return { user_id: userId, new_booking: true, booking_status: true, new_message: true, walk_updates: true, email_enabled: true };
}

export async function updatePreferences(userId: number, prefs: Partial<Omit<NotificationPreferences, 'user_id'>>): Promise<NotificationPreferences> {
  const [existing] = await sql`SELECT * FROM notification_preferences WHERE user_id = ${userId}`;
  if (existing) {
    await sql`
      UPDATE notification_preferences
      SET new_booking = COALESCE(${prefs.new_booking ?? null}, new_booking),
          booking_status = COALESCE(${prefs.booking_status ?? null}, booking_status),
          new_message = COALESCE(${prefs.new_message ?? null}, new_message),
          walk_updates = COALESCE(${prefs.walk_updates ?? null}, walk_updates),
          email_enabled = COALESCE(${prefs.email_enabled ?? null}, email_enabled)
      WHERE user_id = ${userId}
    `;
  } else {
    await sql`
      INSERT INTO notification_preferences (user_id, new_booking, booking_status, new_message, walk_updates, email_enabled)
      VALUES (${userId}, ${prefs.new_booking ?? true}, ${prefs.booking_status ?? true}, ${prefs.new_message ?? true}, ${prefs.walk_updates ?? true}, ${prefs.email_enabled ?? true})
    `;
  }
  return getPreferences(userId);
}
