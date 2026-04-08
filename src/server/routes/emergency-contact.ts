import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { revealEmergencyContact } from '../emergency-contact.ts';
import sql from '../db.ts';

export default function emergencyContactRoutes(router: Router): void {
  // Reveal emergency contact for a booking
  router.post('/bookings/:id/emergency-contact', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    const result = await revealEmergencyContact(bookingId, req.userId!);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          res.status(404).json({ error: 'Booking not found' });
          return;
        case 'forbidden':
          res.status(403).json({ error: 'Not part of this booking' });
          return;
        case 'booking_not_active':
          res.status(400).json({ error: 'Emergency contact is only available for active bookings' });
          return;
        case 'no_emergency_contact':
          res.status(404).json({ error: 'No emergency contact on file' });
          return;
      }
    }

    res.json({ emergency_contact: result.contact });
  });

  // Admin: view emergency contact access logs
  router.get('/admin/emergency-contact-access', authMiddleware, adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rawBookingId = req.query.booking_id ? parseInt(req.query.booking_id as string) : null;
    const bookingId = rawBookingId && Number.isInteger(rawBookingId) && rawBookingId > 0 ? rawBookingId : null;

    const condition = bookingId ? sql`WHERE l.booking_id = ${bookingId}` : sql``;
    const logs = await sql`
      SELECT l.*, u1.name as accessed_by_name, u2.name as contact_owner_name
      FROM emergency_contact_access_log l
      JOIN users u1 ON l.accessed_by = u1.id
      JOIN users u2 ON l.contact_owner_id = u2.id
      ${condition}
      ORDER BY l.accessed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({ logs, meta: { limit, offset } });
  });
}
