import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { calendarQuerySchema } from '../validation.ts';
import { getCalendarData } from '../calendar.ts';
import { generateCalendarToken, revokeCalendarToken, validateCalendarToken, generateICS, type ICSEvent } from '../calendar-export.ts';

export default function calendarRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/calendar', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = calendarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
      return;
    }
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can access the calendar' });
      return;
    }
    const events = await getCalendarData(sql, req.userId!, parsed.data.start, parsed.data.end);
    res.json({ events });
  });

  // --- Calendar Export (iCal/ICS) ---
  router.post('/calendar/token', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const token = await generateCalendarToken(sql, req.userId!);
    const url = `${req.protocol}://${req.get('host')}/api/v1/calendar/export?token=${token}`;
    res.json({ token, url });
  });

  router.delete('/calendar/token', authMiddleware, async (req: AuthenticatedRequest, res) => {
    await revokeCalendarToken(sql, req.userId!);
    res.json({ success: true });
  });

  router.get('/calendar/export', publicLimiter, async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const userId = await validateCalendarToken(sql, token);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const [user] = await sql`SELECT name FROM users WHERE id = ${userId}`;
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const bookings = await sql`
      SELECT b.id, b.status, b.start_time, b.end_time,
             svc.type as service_type,
             o.name as owner_name
      FROM bookings b
      LEFT JOIN services svc ON b.service_id = svc.id
      JOIN users o ON b.owner_id = o.id
      WHERE b.sitter_id = ${userId}
        AND b.start_time > NOW() - INTERVAL '3 months'
        AND b.start_time < NOW() + INTERVAL '6 months'
      ORDER BY b.start_time DESC
    `;

    const bookingIds = bookings.map((b: any) => b.id);
    const bookingPets = bookingIds.length > 0
      ? await sql`
          SELECT bp.booking_id, p.name
          FROM booking_pets bp
          JOIN pets p ON bp.pet_id = p.id
          WHERE bp.booking_id IN ${sql(bookingIds)}
        `
      : [];
    const petsByBooking = new Map<number, string[]>();
    for (const row of bookingPets) {
      const existing = petsByBooking.get(row.booking_id) ?? [];
      petsByBooking.set(row.booking_id, [...existing, row.name]);
    }

    const availability = await sql`
      SELECT * FROM availability WHERE sitter_id = ${userId} ORDER BY day_of_week, start_time
    `;

    const icsStatusMap: Record<string, 'confirmed' | 'tentative' | 'cancelled'> = {
      confirmed: 'confirmed', in_progress: 'confirmed', completed: 'confirmed',
      pending: 'tentative', cancelled: 'cancelled',
    };

    const icsEvents: ICSEvent[] = [];

    for (const b of bookings) {
      const petNames = petsByBooking.get(b.id) || [];
      icsEvents.push({
        id: b.id,
        type: 'booking',
        title: `${b.service_type || 'Booking'} - ${b.owner_name || 'Client'}`,
        description: [
          petNames.length > 0 ? `Pets: ${petNames.join(', ')}` : null,
          b.service_type ? `Service: ${b.service_type}` : null,
          b.owner_name ? `Client: ${b.owner_name}` : null,
        ].filter(Boolean).join('\n'),
        start: new Date(b.start_time),
        end: new Date(b.end_time),
        status: icsStatusMap[b.status] || 'confirmed',
        categories: ['BOOKING'],
      });
    }

    for (const a of availability) {
      if (a.specific_date) {
        const d = new Date(a.specific_date);
        const [sh, sm] = (a.start_time as string).split(':').map(Number);
        const [eh, em] = (a.end_time as string).split(':').map(Number);
        icsEvents.push({
          id: a.id, type: 'availability', title: 'Available',
          start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sh, sm || 0)),
          end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), eh, em || 0)),
          status: 'confirmed', categories: ['AVAILABILITY'],
        });
      } else if (a.day_of_week != null) {
        const now = new Date();
        const diff = ((a.day_of_week as number) - now.getUTCDay() + 7) % 7;
        const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
        const [sh, sm] = (a.start_time as string).split(':').map(Number);
        const [eh, em] = (a.end_time as string).split(':').map(Number);
        icsEvents.push({
          id: a.id, type: 'availability', title: 'Available',
          start: new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), sh, sm || 0)),
          end: new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), eh, em || 0)),
          status: 'confirmed', categories: ['AVAILABILITY'],
        });
      }
    }

    const ics = generateICS(icsEvents, user.name);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="petlink-calendar.ics"');
    res.send(ics);
  });
}
