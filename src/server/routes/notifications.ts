import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, notificationPreferencesSchema } from '../validation.ts';
import { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead, getPreferences, updatePreferences } from '../notifications.ts';

export default function notificationRoutes(router: Router): void {
  router.get('/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const notifications = await getUserNotifications(req.userId!, limit, offset);
    const unreadCount = await getUnreadCount(req.userId!);
    res.json({ notifications, unreadCount });
  });

  router.post('/notifications/:id/read', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const success = await markAsRead(Number(req.params.id), req.userId!);
    if (!success) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ success: true });
  });

  router.post('/notifications/read-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const count = await markAllAsRead(req.userId!);
    res.json({ markedRead: count });
  });

  router.get('/notification-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const prefs = await getPreferences(req.userId!);
    res.json({ preferences: prefs });
  });

  router.put('/notification-preferences', authMiddleware, validate(notificationPreferencesSchema), async (req: AuthenticatedRequest, res) => {
    const { new_booking, booking_status, new_message, walk_updates, booking_reminders, booking_reminders_email, email_enabled } = req.body;
    const prefs = await updatePreferences(req.userId!, { new_booking, booking_status, new_message, walk_updates, booking_reminders, booking_reminders_email, email_enabled });
    res.json({ preferences: prefs });
  });
}
