import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { generateBackupsForBooking, getBackupsForBooking } from '../backup-sitters.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function backupSitterRoutes(router: Router): void {
  // --- List backup sitter suggestions for a booking (owner only) ---
  router.get('/bookings/:id/backups', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        res.status(400).json({ error: 'Invalid booking ID' });
        return;
      }

      const [booking] = await sql`
        SELECT id, owner_id, sitter_id FROM bookings WHERE id = ${bookingId}
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.owner_id !== req.userId) {
        res.status(403).json({ error: 'Only the booking owner can view backup sitters' });
        return;
      }

      const backups = await getBackupsForBooking(bookingId);
      res.json({ backups });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch backup sitters');
      res.status(500).json({ error: 'Failed to fetch backup sitters' });
    }
  });

  // --- Generate backup sitter suggestions (owner only, or auto on confirm) ---
  router.post('/bookings/:id/backups/generate', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        res.status(400).json({ error: 'Invalid booking ID' });
        return;
      }

      const [booking] = await sql`
        SELECT id, owner_id, sitter_id, status FROM bookings WHERE id = ${bookingId}
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.owner_id !== req.userId) {
        res.status(403).json({ error: 'Only the booking owner can generate backup sitters' });
        return;
      }
      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'Backup sitters can only be generated for confirmed bookings' });
        return;
      }

      const backups = await generateBackupsForBooking(bookingId);
      res.json({ backups });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to generate backup sitters');
      res.status(500).json({ error: 'Failed to generate backup sitters' });
    }
  });
}
