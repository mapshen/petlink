import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, notificationPreferencesSchema } from '../validation.ts';
import { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead, getPreferences, updatePreferences } from '../notifications.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function notificationRoutes(router: Router): void {
  router.get('/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const notifications = await getUserNotifications(req.userId!, limit, offset);
      const unreadCount = await getUnreadCount(req.userId!);
      res.json({ notifications, unreadCount });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch notifications');
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  router.post('/notifications/:id/read', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const success = await markAsRead(Number(req.params.id), req.userId!);
      if (!success) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to mark notification as read');
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  router.post('/notifications/read-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const count = await markAllAsRead(req.userId!);
      res.json({ markedRead: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to mark all notifications as read');
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  router.get('/notification-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const prefs = await getPreferences(req.userId!);
      res.json({ preferences: prefs });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch notification preferences');
      res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
  });

  router.put('/notification-preferences', authMiddleware, validate(notificationPreferencesSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { new_booking, booking_status, new_message, walk_updates, booking_reminders, booking_reminders_email, email_enabled } = req.body;
      const prefs = await updatePreferences(req.userId!, { new_booking, booking_status, new_message, walk_updates, booking_reminders, booking_reminders_email, email_enabled });
      res.json({ preferences: prefs });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update notification preferences');
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  });
}
