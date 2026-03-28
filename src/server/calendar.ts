import type { CalendarEvent } from '../types.ts';

/**
 * Fetch calendar data (bookings + availability) for a sitter within a date range.
 * Accepts the postgres tagged-template `sql` instance for testability.
 */
export async function getCalendarData(
  sql: any,
  sitterId: number,
  rangeStart: string,
  rangeEnd: string
): Promise<CalendarEvent[]> {
  const bookingEvents = await fetchBookingEvents(sql, sitterId, rangeStart, rangeEnd);
  const availabilityEvents = await fetchAvailabilityEvents(sql, sitterId, rangeStart, rangeEnd);
  const merged = [...bookingEvents, ...availabilityEvents];
  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return merged;
}

async function fetchBookingEvents(
  sql: any,
  sitterId: number,
  rangeStart: string,
  rangeEnd: string
): Promise<CalendarEvent[]> {
  const rows = await sql`
    SELECT
      b.id,
      b.status,
      b.start_time,
      b.end_time,
      u.name AS owner_name,
      u.avatar_url AS owner_avatar,
      s.type AS service_type
    FROM bookings b
    JOIN users u ON u.id = b.owner_id
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.sitter_id = ${sitterId}
      AND b.start_time < ${rangeEnd}
      AND b.end_time > ${rangeStart}
    ORDER BY b.start_time
  `;

  if (rows.length === 0) return [];

  const bookingIds = rows.map((r: any) => r.id);
  const petRows = await sql`
    SELECT bp.booking_id, p.name
    FROM booking_pets bp
    JOIN pets p ON p.id = bp.pet_id
    WHERE bp.booking_id IN ${sql(bookingIds)}
  `;

  const petsByBooking = new Map<number, string[]>();
  for (const pr of petRows) {
    const list = petsByBooking.get(pr.booking_id) ?? [];
    list.push(pr.name);
    petsByBooking.set(pr.booking_id, list);
  }

  return rows.map((r: any) => ({
    id: r.id,
    type: 'booking' as const,
    title: `${r.owner_name}'s ${r.service_type ?? 'booking'}`,
    start: r.start_time instanceof Date ? r.start_time.toISOString() : String(r.start_time),
    end: r.end_time instanceof Date ? r.end_time.toISOString() : String(r.end_time),
    status: r.status,
    service_type: r.service_type ?? undefined,
    owner_name: r.owner_name,
    owner_avatar: r.owner_avatar ?? undefined,
    pet_names: petsByBooking.get(r.id) ?? [],
  }));
}

async function fetchAvailabilityEvents(
  sql: any,
  sitterId: number,
  rangeStart: string,
  rangeEnd: string
): Promise<CalendarEvent[]> {
  const slots = await sql`
    SELECT id, day_of_week, specific_date, start_time, end_time, recurring
    FROM availability
    WHERE sitter_id = ${sitterId}
  `;

  const events: CalendarEvent[] = [];
  let idCounter = -1; // negative IDs for generated availability events

  for (const slot of slots) {
    if (slot.recurring && slot.day_of_week != null) {
      const expanded = expandRecurring(slot, rangeStart, rangeEnd, idCounter);
      events.push(...expanded.events);
      idCounter = expanded.nextId;
    } else if (slot.specific_date) {
      const dateStr = slot.specific_date instanceof Date
        ? slot.specific_date.toISOString().slice(0, 10)
        : String(slot.specific_date).slice(0, 10);

      if (dateStr >= rangeStart.slice(0, 10) && dateStr < rangeEnd.slice(0, 10)) {
        events.push({
          id: idCounter--,
          type: 'availability',
          title: 'Available',
          start: `${dateStr}T${slot.start_time}`,
          end: `${dateStr}T${slot.end_time}`,
          recurring: false,
          availability_id: slot.id,
        });
      }
    }
  }

  return events;
}

function expandRecurring(
  slot: any,
  rangeStart: string,
  rangeEnd: string,
  startId: number
): { events: CalendarEvent[]; nextId: number } {
  const events: CalendarEvent[] = [];
  let idCounter = startId;
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);

  // Walk day-by-day from rangeStart to rangeEnd
  const current = new Date(start);
  while (current < end) {
    if (current.getUTCDay() === slot.day_of_week) {
      const dateStr = current.toISOString().slice(0, 10);
      events.push({
        id: idCounter--,
        type: 'availability',
        title: 'Available',
        start: `${dateStr}T${slot.start_time}`,
        end: `${dateStr}T${slot.end_time}`,
        recurring: true,
        availability_id: slot.id,
      });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return { events, nextId: idCounter };
}
