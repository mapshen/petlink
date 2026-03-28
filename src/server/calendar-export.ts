import crypto from 'crypto';

export interface ICSEvent {
  id: number;
  type: 'booking' | 'availability';
  title: string;
  description?: string;
  start: Date;
  end: Date;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  categories?: string[];
}

export async function generateCalendarToken(sql: any, userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const [row] = await sql`
    INSERT INTO calendar_tokens (user_id, token)
    VALUES (${userId}, ${token})
    ON CONFLICT (user_id) DO UPDATE SET token = ${token}, created_at = NOW()
    RETURNING token
  `;
  return row.token;
}

export async function getCalendarToken(sql: any, userId: number): Promise<string | null> {
  const [row] = await sql`
    SELECT token FROM calendar_tokens WHERE user_id = ${userId}
  `;
  return row ? row.token : null;
}

export async function revokeCalendarToken(sql: any, userId: number): Promise<void> {
  await sql`DELETE FROM calendar_tokens WHERE user_id = ${userId}`;
}

export async function validateCalendarToken(sql: any, token: string): Promise<number | null> {
  const [row] = await sql`
    SELECT user_id FROM calendar_tokens WHERE token = ${token}
  `;
  return row ? row.user_id : null;
}

function foldLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let remaining = line.slice(75);
  while (remaining.length > 0) {
    parts.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return parts.join('\r\n');
}

function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function mapStatusToICS(status?: string): string {
  switch (status) {
    case 'confirmed':
      return 'CONFIRMED';
    case 'tentative':
      return 'TENTATIVE';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'CONFIRMED';
  }
}

export function generateICS(events: ICSEvent[], sitterName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//PetLink//Calendar//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(sitterName)}'s PetLink Calendar`,
  ];

  for (const event of events) {
    const uid = `${event.type}-${event.id}@petlink.app`;
    const eventLines: string[] = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${formatDateUTC(event.start)}`,
      `DTEND:${formatDateUTC(event.end)}`,
      `SUMMARY:${escapeICSText(event.title)}`,
    ];

    if (event.description) {
      eventLines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
    }

    eventLines.push(`STATUS:${mapStatusToICS(event.status)}`);

    if (event.categories && event.categories.length > 0) {
      eventLines.push(`CATEGORIES:${event.categories.join(',')}`);
    }

    eventLines.push('END:VEVENT');
    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
