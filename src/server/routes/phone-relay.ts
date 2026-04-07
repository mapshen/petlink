import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { getBookingContact } from '../phone-relay.ts';

export default function phoneRelayRoutes(router: Router): void {
  router.get('/bookings/:id/contact', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    const result = await getBookingContact(bookingId, req.userId!);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          res.status(404).json({ error: 'Booking not found' });
          return;
        case 'forbidden':
          res.status(403).json({ error: 'Not part of this booking' });
          return;
        case 'booking_not_active':
          res.status(400).json({ error: 'Contact info is only available for active bookings' });
          return;
      }
    }

    res.json({ contact: result });
  });
}
