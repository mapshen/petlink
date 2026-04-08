import sql from './db.ts';
import logger, { sanitizeError } from './logger.ts';

// --- Constants ---
export const MAX_CAMPAIGNS_PER_MONTH = 2;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 5000;

export type CampaignType = 'holiday' | 'marketing';
export type CampaignAudience = 'all_clients' | 'recent_clients' | 'specific_clients';
export type CampaignStatus = 'draft' | 'sent' | 'cancelled';

export interface Campaign {
  readonly id: number;
  readonly sitter_id: number;
  readonly type: CampaignType;
  readonly subject: string;
  readonly body: string;
  readonly audience: CampaignAudience;
  readonly status: CampaignStatus;
  readonly recipient_count: number;
  readonly open_count: number;
  readonly click_count: number;
  readonly discount_code?: string | null;
  readonly discount_percent?: number | null;
  readonly holiday_name?: string | null;
  readonly sent_at: string | null;
  readonly created_at: string;
}

export interface CampaignRecipient {
  readonly id: number;
  readonly campaign_id: number;
  readonly recipient_id: number;
  readonly sent_at: string;
  readonly opened_at: string | null;
  readonly clicked_at: string | null;
}

// Pre-built holiday templates
export const HOLIDAY_TEMPLATES = [
  { id: 'christmas', name: 'Christmas', emoji: '🎄', defaultSubject: 'Happy Holidays from {sitter_name}!', defaultBody: 'Wishing you and your furry family a wonderful holiday season! 🎄🐾\n\nI loved caring for {pet_name} this year and hope to see you again soon.\n\nHappy Holidays!\n{sitter_name}' },
  { id: 'new_year', name: 'New Year', emoji: '🎉', defaultSubject: 'Happy New Year from {sitter_name}!', defaultBody: 'Happy New Year! 🎉\n\nThank you for trusting me with your pets in {year}. Looking forward to more adventures together!\n\n{sitter_name}' },
  { id: 'thanksgiving', name: 'Thanksgiving', emoji: '🦃', defaultSubject: 'Happy Thanksgiving from {sitter_name}!', defaultBody: 'Happy Thanksgiving! 🦃\n\nI\'m grateful for all my amazing pet families. Thank you for being one of them!\n\n{sitter_name}' },
  { id: 'valentines', name: "Valentine's Day", emoji: '💕', defaultSubject: "Happy Valentine's Day from {sitter_name}!", defaultBody: "Sending love to you and your pets this Valentine's Day! 💕🐾\n\n{sitter_name}" },
  { id: 'pet_day', name: 'National Pet Day', emoji: '🐾', defaultSubject: 'Happy National Pet Day!', defaultBody: "Happy National Pet Day! 🐾\n\nCelebrating all the amazing pets I get to care for — including yours!\n\n{sitter_name}" },
] as const;

/**
 * Get past clients for a sitter (owners who completed bookings).
 */
export async function getClients(
  sitterId: number,
  audience: CampaignAudience,
  specificIds?: number[]
): Promise<{ id: number; name: string; email: string }[]> {
  if (audience === 'specific_clients' && specificIds?.length) {
    const clients = await sql`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      JOIN bookings b ON b.owner_id = u.id
      WHERE b.sitter_id = ${sitterId} AND b.status = 'completed'
        AND u.id = ANY(${specificIds})
    `;
    return clients as unknown as { id: number; name: string; email: string }[];
  }

  const recentFilter = audience === 'recent_clients'
    ? sql`AND b.start_time >= NOW() - INTERVAL '3 months'`
    : sql``;

  const clients = await sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    JOIN bookings b ON b.owner_id = u.id
    WHERE b.sitter_id = ${sitterId} AND b.status = 'completed'
      ${recentFilter}
    ORDER BY u.name
  `;
  return clients as unknown as { id: number; name: string; email: string }[];
}

/**
 * Check if sitter has hit the monthly campaign limit.
 */
export async function canSendCampaign(sitterId: number): Promise<{ allowed: boolean; remaining: number }> {
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM campaigns
    WHERE sitter_id = ${sitterId} AND status = 'sent'
      AND sent_at >= date_trunc('month', NOW())
  `;
  const remaining = MAX_CAMPAIGNS_PER_MONTH - count;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

/**
 * Create a campaign draft.
 */
export async function createCampaign(input: {
  sitter_id: number;
  type: CampaignType;
  subject: string;
  body: string;
  audience: CampaignAudience;
  discount_code?: string;
  discount_percent?: number;
  holiday_name?: string;
}): Promise<Campaign> {
  const [campaign] = await sql`
    INSERT INTO campaigns (sitter_id, type, subject, body, audience, discount_code, discount_percent, holiday_name, status)
    VALUES (${input.sitter_id}, ${input.type}, ${input.subject}, ${input.body}, ${input.audience},
            ${input.discount_code ?? null}, ${input.discount_percent ?? null}, ${input.holiday_name ?? null}, 'draft')
    RETURNING *
  `;
  return campaign as unknown as Campaign;
}

/**
 * Send a campaign — creates recipient records and marks as sent.
 */
export async function sendCampaign(
  campaignId: number,
  sitterId: number
): Promise<{ success: boolean; error?: string; recipientCount?: number }> {
  const [campaign] = await sql`
    SELECT * FROM campaigns WHERE id = ${campaignId} AND sitter_id = ${sitterId}
  `;
  if (!campaign) {
    return { success: false, error: 'Campaign not found' };
  }
  if (campaign.status !== 'draft') {
    return { success: false, error: 'Campaign has already been sent or cancelled' };
  }

  const { allowed } = await canSendCampaign(sitterId);
  if (!allowed) {
    return { success: false, error: `Monthly campaign limit (${MAX_CAMPAIGNS_PER_MONTH}) reached` };
  }

  const clients = await getClients(sitterId, campaign.audience);
  if (clients.length === 0) {
    return { success: false, error: 'No recipients found for this audience' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    // Insert recipient records
    for (const client of clients) {
      await tx`
        INSERT INTO campaign_recipients (campaign_id, recipient_id, sent_at)
        VALUES (${campaignId}, ${client.id}, NOW())
        ON CONFLICT DO NOTHING
      `;
    }

    // Mark campaign as sent
    await tx`
      UPDATE campaigns SET status = 'sent', sent_at = NOW(), recipient_count = ${clients.length}
      WHERE id = ${campaignId}
    `;
  });

  logger.info({ campaignId, sitterId, recipientCount: clients.length }, 'Campaign sent');
  return { success: true, recipientCount: clients.length };
}

/**
 * Record that a recipient opened a campaign message.
 */
export async function recordOpen(campaignId: number, recipientId: number): Promise<void> {
  await sql`
    UPDATE campaign_recipients SET opened_at = COALESCE(opened_at, NOW())
    WHERE campaign_id = ${campaignId} AND recipient_id = ${recipientId}
  `.catch(() => {});

  await sql`
    UPDATE campaigns SET open_count = (
      SELECT COUNT(*)::int FROM campaign_recipients WHERE campaign_id = ${campaignId} AND opened_at IS NOT NULL
    ) WHERE id = ${campaignId}
  `.catch(() => {});
}

/**
 * Record that a recipient clicked a campaign CTA.
 */
export async function recordClick(campaignId: number, recipientId: number): Promise<void> {
  await sql`
    UPDATE campaign_recipients SET clicked_at = COALESCE(clicked_at, NOW())
    WHERE campaign_id = ${campaignId} AND recipient_id = ${recipientId}
  `.catch(() => {});

  await sql`
    UPDATE campaigns SET click_count = (
      SELECT COUNT(*)::int FROM campaign_recipients WHERE campaign_id = ${campaignId} AND clicked_at IS NOT NULL
    ) WHERE id = ${campaignId}
  `.catch(() => {});
}

/**
 * Get campaigns for a sitter.
 */
export async function getCampaigns(sitterId: number): Promise<Campaign[]> {
  const campaigns = await sql`
    SELECT * FROM campaigns WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return campaigns as unknown as Campaign[];
}

/**
 * Get campaign analytics (recipients with open/click data).
 */
export async function getCampaignRecipients(campaignId: number, sitterId: number): Promise<CampaignRecipient[]> {
  const recipients = await sql`
    SELECT cr.*, u.name AS recipient_name, u.email AS recipient_email
    FROM campaign_recipients cr
    JOIN users u ON u.id = cr.recipient_id
    JOIN campaigns c ON c.id = cr.campaign_id
    WHERE cr.campaign_id = ${campaignId} AND c.sitter_id = ${sitterId}
    ORDER BY cr.sent_at DESC
  `;
  return recipients as unknown as CampaignRecipient[];
}
