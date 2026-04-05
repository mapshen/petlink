import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createInquirySchema, sendOfferSchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import logger, { sanitizeError } from '../logger.ts';

const OFFER_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

function applyLazyExpiration(inquiry: Record<string, unknown>): Record<string, unknown> {
  if (
    inquiry.status === 'offer_sent' &&
    inquiry.offer_sent_at &&
    Date.now() - new Date(inquiry.offer_sent_at as string).getTime() > OFFER_EXPIRY_MS
  ) {
    return { ...inquiry, status: 'expired' };
  }
  return inquiry;
}

export default function inquiryRoutes(router: Router, io: Server): void {
  // POST /inquiries — owner creates inquiry
  router.post('/inquiries', authMiddleware, validate(createInquirySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { sitter_id, service_type, pet_ids, message } = req.body;

      if (Number(sitter_id) === req.userId) {
        res.status(400).json({ error: 'Cannot send an inquiry to yourself' });
        return;
      }

      // Verify sitter exists and is approved
      const [sitter] = await sql`SELECT id, name, approval_status FROM users WHERE id = ${sitter_id}`;
      if (!sitter || sitter.approval_status !== 'approved') {
        res.status(400).json({ error: 'This sitter is not available' });
        return;
      }

      // Verify all pets belong to the owner
      const ownerPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
      if (ownerPets.length !== pet_ids.length) {
        res.status(400).json({ error: 'One or more pets do not belong to you' });
        return;
      }

      // Create inquiry + link pets in transaction (unique index prevents duplicates)
      let inquiry;
      try {
        inquiry = await sql.begin(async (tx: any) => {
          const [inq] = await tx`
            INSERT INTO inquiries (owner_id, sitter_id, service_type, message)
            VALUES (${req.userId}, ${sitter_id}, ${service_type || null}, ${message})
            RETURNING *
          `;

          const petRows = pet_ids.map((petId: number) => ({ inquiry_id: inq.id, pet_id: petId }));
          await tx`INSERT INTO inquiry_pets ${tx(petRows, 'inquiry_id', 'pet_id')}`;

          // Auto-create first message tagged with inquiry_id
          const [msg] = await tx`
            INSERT INTO messages (sender_id, receiver_id, content, inquiry_id)
            VALUES (${req.userId}, ${sitter_id}, ${message}, ${inq.id})
            RETURNING *
          `;

          return { ...inq, _firstMessage: msg };
        });
      } catch (err: any) {
        // Unique index violation = duplicate active inquiry
        if (err?.code === '23505' && err?.constraint_name?.includes('inquiries_active_pair')) {
          res.status(409).json({ error: 'You already have an active inquiry with this sitter' });
          return;
        }
        throw err;
      }

      // Fetch pets for response
      const pets = await sql`
        SELECT p.id, p.name, p.photo_url FROM pets p
        JOIN inquiry_pets ip ON ip.pet_id = p.id
        WHERE ip.inquiry_id = ${inquiry.id}
      `;

      // Emit the first message via Socket.io for real-time delivery
      if (inquiry._firstMessage) {
        io.to(String(sitter_id)).emit('receive_message', inquiry._firstMessage);
        io.to(String(req.userId)).emit('receive_message', inquiry._firstMessage);
      }

      // Notify sitter
      const [owner] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const notification = await createNotification(
        sitter_id, 'new_inquiry', 'New Inquiry',
        `${owner.name} has a question about your services.`,
        { inquiry_id: inquiry.id }
      );
      if (notification) io.to(String(sitter_id)).emit('notification', notification);

      const { _firstMessage: _, ...inquiryData } = inquiry;
      res.status(201).json({ inquiry: { ...inquiryData, pets } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create inquiry');
      res.status(500).json({ error: 'Failed to create inquiry' });
    }
  });

  // GET /inquiries — list inquiries for current user
  router.get('/inquiries', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const rows = await sql`
        SELECT i.*,
          o.name AS owner_name, o.avatar_url AS owner_avatar,
          s.name AS sitter_name, s.avatar_url AS sitter_avatar
        FROM inquiries i
        JOIN users o ON o.id = i.owner_id
        JOIN users s ON s.id = i.sitter_id
        WHERE i.owner_id = ${req.userId} OR i.sitter_id = ${req.userId}
        ORDER BY i.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // Fetch pets for each inquiry
      const inquiryIds = rows.map((r: any) => r.id);
      const allPets = inquiryIds.length > 0
        ? await sql`
            SELECT ip.inquiry_id, p.id, p.name, p.photo_url
            FROM inquiry_pets ip JOIN pets p ON p.id = ip.pet_id
            WHERE ip.inquiry_id = ANY(${inquiryIds})
          `
        : [];

      const petsByInquiry = new Map<number, { id: number; name: string; photo_url?: string }[]>();
      for (const pet of allPets) {
        const list = petsByInquiry.get(pet.inquiry_id) ?? [];
        list.push({ id: pet.id, name: pet.name, photo_url: pet.photo_url });
        petsByInquiry.set(pet.inquiry_id, list);
      }

      const inquiries = rows.map((row: any) =>
        applyLazyExpiration({ ...row, pets: petsByInquiry.get(row.id) ?? [] })
      );

      // Batch-persist any newly expired inquiries
      const expiredIds = inquiries
        .filter((inq: Record<string, unknown>, i: number) => inq.status === 'expired' && (rows[i] as any).status !== 'expired')
        .map((inq: Record<string, unknown>) => inq.id as number);
      if (expiredIds.length > 0) {
        sql`UPDATE inquiries SET status = 'expired', updated_at = NOW() WHERE id = ANY(${expiredIds}) AND status = 'offer_sent'`.catch(() => {});
      }

      res.json({ inquiries });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to list inquiries');
      res.status(500).json({ error: 'Failed to list inquiries' });
    }
  });

  // GET /inquiries/:id — get single inquiry
  router.get('/inquiries/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const inquiryId = Number(req.params.id);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        res.status(400).json({ error: 'Invalid inquiry ID' });
        return;
      }

      const [row] = await sql`
        SELECT i.*,
          o.name AS owner_name, o.avatar_url AS owner_avatar,
          s.name AS sitter_name, s.avatar_url AS sitter_avatar
        FROM inquiries i
        JOIN users o ON o.id = i.owner_id
        JOIN users s ON s.id = i.sitter_id
        WHERE i.id = ${inquiryId}
      `;
      if (!row) {
        res.status(404).json({ error: 'Inquiry not found' });
        return;
      }
      if (row.owner_id !== req.userId && row.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Not part of this inquiry' });
        return;
      }

      const pets = await sql`
        SELECT p.id, p.name, p.photo_url FROM pets p
        JOIN inquiry_pets ip ON ip.pet_id = p.id
        WHERE ip.inquiry_id = ${inquiryId}
      `;

      const inquiry = applyLazyExpiration({ ...row, pets });

      // Persist expiration if needed (fire-and-forget)
      if (inquiry.status === 'expired' && row.status !== 'expired') {
        sql`UPDATE inquiries SET status = 'expired', updated_at = NOW() WHERE id = ${inquiryId} AND status = 'offer_sent'`.catch(() => {});
      }

      res.json({ inquiry });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to get inquiry');
      res.status(500).json({ error: 'Failed to get inquiry' });
    }
  });

  // PUT /inquiries/:id/offer — sitter sends booking offer
  router.put('/inquiries/:id/offer', authMiddleware, validate(sendOfferSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const inquiryId = Number(req.params.id);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        res.status(400).json({ error: 'Invalid inquiry ID' });
        return;
      }

      const { offer_price_cents, offer_start_time, offer_end_time, offer_notes } = req.body;

      if (new Date(offer_start_time).getTime() < Date.now()) {
        res.status(400).json({ error: 'Offer start time cannot be in the past' });
        return;
      }

      // Verify sitter is still approved
      const [sitterUser] = await sql`SELECT approval_status FROM users WHERE id = ${req.userId}`;
      if (!sitterUser || sitterUser.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account is not active' });
        return;
      }

      const [inquiry] = await sql`
        SELECT * FROM inquiries WHERE id = ${inquiryId}
      `;
      if (!inquiry) {
        res.status(404).json({ error: 'Inquiry not found' });
        return;
      }
      if (inquiry.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Only the sitter can send an offer' });
        return;
      }
      if (inquiry.status !== 'open') {
        res.status(400).json({ error: 'Can only send offer on an open inquiry' });
        return;
      }

      const [updated] = await sql`
        UPDATE inquiries
        SET status = 'offer_sent',
            offer_price_cents = ${offer_price_cents},
            offer_start_time = ${offer_start_time},
            offer_end_time = ${offer_end_time},
            offer_notes = ${offer_notes || null},
            offer_sent_at = NOW(),
            updated_at = NOW()
        WHERE id = ${inquiryId} AND sitter_id = ${req.userId} AND status = 'open'
        RETURNING *
      `;
      if (!updated) {
        res.status(400).json({ error: 'Failed to send offer' });
        return;
      }

      // Notify owner
      const [sitter] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const notification = await createNotification(
        inquiry.owner_id, 'inquiry_offer', 'Booking Offer Received',
        `${sitter.name} sent you a booking offer.`,
        { inquiry_id: inquiryId }
      );
      if (notification) io.to(String(inquiry.owner_id)).emit('notification', notification);

      res.json({ inquiry: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to send offer');
      res.status(500).json({ error: 'Failed to send offer' });
    }
  });

  // PUT /inquiries/:id/accept — owner accepts offer, creates booking
  router.put('/inquiries/:id/accept', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const inquiryId = Number(req.params.id);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        res.status(400).json({ error: 'Invalid inquiry ID' });
        return;
      }

      // All validation + booking creation inside a single transaction with row lock
      const result = await sql.begin(async (tx: any) => {
        // Lock the inquiry row to prevent concurrent accepts
        const [inquiry] = await tx`SELECT * FROM inquiries WHERE id = ${inquiryId} FOR UPDATE`;
        if (!inquiry) {
          throw Object.assign(new Error('Inquiry not found'), { statusCode: 404 });
        }
        if (inquiry.owner_id !== req.userId) {
          throw Object.assign(new Error('Only the owner can accept an offer'), { statusCode: 403 });
        }
        if (inquiry.status !== 'offer_sent') {
          throw Object.assign(new Error('No offer to accept'), { statusCode: 400 });
        }

        // Check lazy expiration inside the lock
        if (Date.now() - new Date(inquiry.offer_sent_at).getTime() > OFFER_EXPIRY_MS) {
          await tx`UPDATE inquiries SET status = 'expired', updated_at = NOW() WHERE id = ${inquiryId}`;
          throw Object.assign(new Error('This offer has expired'), { statusCode: 400 });
        }

        // Get inquiry pets
        const inquiryPets = await tx`SELECT pet_id FROM inquiry_pets WHERE inquiry_id = ${inquiryId}`;
        const petIds = inquiryPets.map((p: any) => p.pet_id);

        // Find a matching service for the sitter
        let serviceId = null;
        if (inquiry.service_type) {
          const [service] = await tx`
            SELECT id FROM services WHERE sitter_id = ${inquiry.sitter_id} AND type = ${inquiry.service_type} LIMIT 1
          `;
          if (service) serviceId = service.id;
        }
        if (!serviceId) {
          const [anyService] = await tx`SELECT id FROM services WHERE sitter_id = ${inquiry.sitter_id} LIMIT 1`;
          if (anyService) serviceId = anyService.id;
        }
        if (!serviceId) {
          throw Object.assign(new Error('Sitter has no active services. Cannot create booking.'), { statusCode: 400 });
        }

        const [booking] = await tx`
          INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price_cents, status)
          VALUES (${inquiry.sitter_id}, ${req.userId}, ${serviceId}, ${inquiry.offer_start_time}, ${inquiry.offer_end_time}, ${inquiry.offer_price_cents}, 'pending')
          RETURNING *
        `;

        if (petIds.length > 0) {
          const petRows = petIds.map((petId: number) => ({ booking_id: booking.id, pet_id: petId }));
          await tx`INSERT INTO booking_pets ${tx(petRows, 'booking_id', 'pet_id')}`;
        }

        const [updated] = await tx`
          UPDATE inquiries
          SET status = 'accepted', booking_id = ${booking.id}, updated_at = NOW()
          WHERE id = ${inquiryId} AND status = 'offer_sent'
          RETURNING *
        `;

        return { booking, inquiry: updated, sitter_id: inquiry.sitter_id };
      });

      // Notify sitter
      const [owner] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const notification = await createNotification(
        result.sitter_id, 'new_booking', 'Offer Accepted',
        `${owner.name} accepted your booking offer.`,
        { booking_id: result.booking.id, inquiry_id: inquiryId }
      );
      if (notification) io.to(String(result.sitter_id)).emit('notification', notification);

      res.json({ inquiry: result.inquiry, booking: result.booking });
    } catch (error: any) {
      if (error?.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      logger.error({ err: sanitizeError(error) }, 'Failed to accept offer');
      res.status(500).json({ error: 'Failed to accept offer' });
    }
  });

  // PUT /inquiries/:id/decline — either party declines
  router.put('/inquiries/:id/decline', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const inquiryId = Number(req.params.id);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        res.status(400).json({ error: 'Invalid inquiry ID' });
        return;
      }

      const [inquiry] = await sql`SELECT * FROM inquiries WHERE id = ${inquiryId}`;
      if (!inquiry) {
        res.status(404).json({ error: 'Inquiry not found' });
        return;
      }
      if (inquiry.owner_id !== req.userId && inquiry.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Not part of this inquiry' });
        return;
      }
      if (!['open', 'offer_sent'].includes(inquiry.status)) {
        res.status(400).json({ error: 'Cannot decline this inquiry' });
        return;
      }

      const [updated] = await sql`
        UPDATE inquiries SET status = 'declined', updated_at = NOW()
        WHERE id = ${inquiryId} AND status IN ('open', 'offer_sent')
        RETURNING *
      `;
      if (!updated) {
        res.status(409).json({ error: 'Inquiry was already resolved' });
        return;
      }

      // Notify the other party
      const otherUserId = inquiry.owner_id === req.userId ? inquiry.sitter_id : inquiry.owner_id;
      const [decliner] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const notification = await createNotification(
        otherUserId, 'booking_status', 'Inquiry Declined',
        `${decliner.name} declined the inquiry.`,
        { inquiry_id: inquiryId }
      );
      if (notification) io.to(String(otherUserId)).emit('notification', notification);

      res.json({ inquiry: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to decline inquiry');
      res.status(500).json({ error: 'Failed to decline inquiry' });
    }
  });
}
