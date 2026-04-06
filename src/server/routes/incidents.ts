import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createIncidentSchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import { sendEmail, buildIncidentReportEmail } from '../email.ts';
import logger, { sanitizeError } from '../logger.ts';

const INCIDENT_CATEGORY_LABELS: Record<string, string> = {
  pet_injury: 'Pet Injury',
  property_damage: 'Property Damage',
  safety_concern: 'Safety Concern',
  behavioral_issue: 'Behavioral Issue',
  service_issue: 'Service Issue',
  other: 'Other',
};

const MAX_INCIDENTS_PER_USER_PER_BOOKING = 10;

export default function incidentRoutes(router: Router, io: Server): void {
  // Create an incident report
  router.post('/incidents', authMiddleware, validate(createIncidentSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, category, description, notes, evidence } = req.body;

    // Verify booking exists and user is a party
    const [booking] = await sql`
      SELECT id, owner_id, sitter_id, status FROM bookings WHERE id = ${booking_id}
    `;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'You are not part of this booking' });
      return;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      res.status(400).json({ error: 'Incidents can only be reported on active bookings' });
      return;
    }

    // Insert incident + evidence in a transaction (rate limit check inside tx to avoid TOCTOU)
    let rateLimited = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.begin(async (tx: any) => {
      const [{ count: existingCount }] = await tx`
        SELECT COUNT(*)::int as count FROM incident_reports
        WHERE booking_id = ${booking_id} AND reporter_id = ${req.userId}
      `;
      if (existingCount >= MAX_INCIDENTS_PER_USER_PER_BOOKING) {
        rateLimited = true;
        return { incident: null, evidenceRows: [] };
      }

      const [inc] = await tx`
        INSERT INTO incident_reports (booking_id, reporter_id, category, description, notes)
        VALUES (${booking_id}, ${req.userId}, ${category}, ${description}, ${notes ?? null})
        RETURNING *
      `;

      let evRows: { id: number; media_url: string; media_type: string }[] = [];
      if (evidence && evidence.length > 0) {
        const rows = evidence.map((e: { media_url: string; media_type: string }) => ({
          incident_id: inc.id,
          media_url: e.media_url,
          media_type: e.media_type,
        }));
        evRows = await tx`
          INSERT INTO incident_evidence ${tx(rows, 'incident_id', 'media_url', 'media_type')}
          RETURNING id, media_url, media_type
        `;
      }
      return { incident: inc, evidenceRows: evRows };
    });

    if (rateLimited) {
      res.status(429).json({ error: 'Maximum incident reports reached for this booking' });
      return;
    }
    const { incident, evidenceRows } = result;

    // Determine the other party
    const otherPartyId = booking.owner_id === req.userId ? booking.sitter_id : booking.owner_id;
    const [reporter] = await sql`SELECT name, email FROM users WHERE id = ${req.userId}`;
    const [otherParty] = await sql`SELECT name, email FROM users WHERE id = ${otherPartyId}`;

    const categoryLabel = INCIDENT_CATEGORY_LABELS[category] || category;

    // Notify the other party (incident_report bypasses preferences — see notifications.ts)
    const notification = await createNotification(
      otherPartyId,
      'incident_report',
      'Incident Reported',
      `${reporter.name} reported a ${categoryLabel.toLowerCase()} on your booking.`,
      { booking_id, incident_id: incident.id, category }
    );
    if (notification) io.to(String(otherPartyId)).emit('notification', notification);

    // Notify admin users
    const admins = await sql`SELECT id, email, name FROM users WHERE roles @> '{admin}'::text[]`;
    for (const admin of admins) {
      const adminNotif = await createNotification(
        admin.id,
        'incident_report',
        'Incident Reported',
        `${reporter.name} reported a ${categoryLabel.toLowerCase()} on booking #${booking_id}.`,
        { booking_id, incident_id: incident.id, category }
      );
      if (adminNotif) io.to(String(admin.id)).emit('notification', adminNotif);
    }

    // Send emails (fire-and-forget)
    if (otherParty?.email) {
      const emailContent = buildIncidentReportEmail({
        recipientName: otherParty.name,
        reporterName: reporter.name,
        category,
        description,
        bookingId: booking_id,
      });
      sendEmail({ to: otherParty.email, ...emailContent }).catch((err: unknown) => {
        logger.error({ err: sanitizeError(err as Error) }, 'Failed to send incident email');
      });
    }
    for (const admin of admins) {
      const emailContent = buildIncidentReportEmail({
        recipientName: admin.name,
        reporterName: reporter.name,
        category,
        description,
        bookingId: booking_id,
      });
      sendEmail({ to: admin.email, ...emailContent }).catch((err: unknown) => {
        logger.error({ err: sanitizeError(err as Error) }, 'Failed to send admin incident email');
      });
    }

    res.status(201).json({
      incident: { ...incident, evidence: evidenceRows },
    });
  });

  // List incidents for a booking
  router.get('/incidents/booking/:bookingId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    // Verify user is a party or admin
    const [booking] = await sql`SELECT owner_id, sitter_id FROM bookings WHERE id = ${bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    const isAdmin = currentUser?.roles?.includes('admin');
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId && !isAdmin) {
      res.status(403).json({ error: 'You are not part of this booking' });
      return;
    }

    const incidents = await sql`
      SELECT ir.*, u.name as reporter_name, u.avatar_url as reporter_avatar
      FROM incident_reports ir
      JOIN users u ON ir.reporter_id = u.id
      WHERE ir.booking_id = ${bookingId}
      ORDER BY ir.created_at DESC
      LIMIT 50
    `;

    // Batch-fetch evidence
    const incidentIds = incidents.map((i: { id: number }) => i.id);
    const evidence = incidentIds.length > 0
      ? await sql`SELECT * FROM incident_evidence WHERE incident_id = ANY(${incidentIds}) ORDER BY created_at`
      : [];

    const evidenceByIncident = new Map<number, typeof evidence>();
    for (const e of evidence) {
      const existing = evidenceByIncident.get(e.incident_id) ?? [];
      evidenceByIncident.set(e.incident_id, [...existing, e]);
    }

    const enriched = incidents.map((i: { id: number }) => ({
      ...i,
      evidence: evidenceByIncident.get(i.id) ?? [],
    }));

    res.json({ incidents: enriched });
  });

  // Get single incident
  router.get('/incidents/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const incidentId = Number(req.params.id);
    if (!Number.isInteger(incidentId) || incidentId <= 0) {
      res.status(400).json({ error: 'Invalid incident ID' });
      return;
    }

    const [incident] = await sql`
      SELECT ir.*, u.name as reporter_name, u.avatar_url as reporter_avatar
      FROM incident_reports ir
      JOIN users u ON ir.reporter_id = u.id
      WHERE ir.id = ${incidentId}
    `;
    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    // Verify user is a party or admin
    const [booking] = await sql`SELECT owner_id, sitter_id FROM bookings WHERE id = ${incident.booking_id}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    const isAdmin = currentUser?.roles?.includes('admin');
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId && !isAdmin) {
      res.status(403).json({ error: 'You are not part of this booking' });
      return;
    }

    const evidence = await sql`SELECT * FROM incident_evidence WHERE incident_id = ${incidentId} ORDER BY created_at`;

    res.json({ incident: { ...incident, evidence } });
  });
}
