/**
 * Checkr background check integration.
 *
 * Uses Checkr's API to create candidates, send invitations, and process
 * webhook results. Supports both sandbox and production modes.
 *
 * Required environment variables:
 *   CHECKR_API_KEY - Checkr API key (sandbox or production)
 *   CHECKR_WEBHOOK_SECRET - Webhook signing secret for verifying callbacks
 *
 * Flow:
 *   1. Sitter initiates verification → createCandidate + createInvitation
 *   2. Sitter completes Checkr's hosted flow (SSN, consent, etc.)
 *   3. Checkr processes check (1-3 business days)
 *   4. Webhook receives report.completed → processWebhookEvent
 *   5. Verification status updated (passed/failed)
 */

import crypto from 'crypto';

const CHECKR_API_BASE = process.env.CHECKR_API_BASE || 'https://api.checkr.com/v1';
const CHECKR_API_KEY = process.env.CHECKR_API_KEY || '';

interface CheckrCandidate {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface CheckrInvitation {
  id: string;
  invitation_url: string;
  status: string;
  candidate_id: string;
}

interface CheckrWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      result: string;
      candidate_id: string;
      package: string;
      adjudication?: string;
    };
  };
}

async function checkrFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${CHECKR_API_BASE}${path}`;
  const authHeader = Buffer.from(`${CHECKR_API_KEY}:`).toString('base64');

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authHeader}`,
      ...options.headers,
    },
  });
}

export async function createCandidate(email: string, firstName: string, lastName: string): Promise<CheckrCandidate> {
  const res = await checkrFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: firstName,
      last_name: lastName,
      work_locations: [{ country: 'US' }],
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Checkr candidate creation failed: ${res.status}`);
  }

  return res.json();
}

export async function createInvitation(candidateId: string, packageSlug: string = 'tasker_standard'): Promise<CheckrInvitation> {
  const res = await checkrFetch('/invitations', {
    method: 'POST',
    body: JSON.stringify({
      candidate_id: candidateId,
      package: packageSlug,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Checkr invitation creation failed: ${res.status}`);
  }

  return res.json();
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = hmac.digest('hex');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export function parseWebhookEvent(body: unknown): CheckrWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  const event = body as CheckrWebhookEvent;
  if (!event.type || !event.data?.object) return null;
  return event;
}

/**
 * Maps Checkr report status/result to our bg_check_status enum.
 *
 * Checkr statuses: pending, complete, suspended, dispute
 * Checkr results: clear, consider, null (pending)
 *
 * Our statuses: pending, submitted, passed, failed
 */
export function mapCheckrStatus(status: string, result: string | null, adjudication?: string): 'submitted' | 'passed' | 'failed' {
  if (status === 'complete') {
    if (adjudication === 'engaged') return 'passed';
    if (result === 'clear') return 'passed';
    if (result === 'consider') return 'failed';
    return 'failed';
  }
  if (status === 'suspended' || status === 'dispute') return 'submitted';
  return 'submitted';
}

export function isCheckrConfigured(): boolean {
  return Boolean(CHECKR_API_KEY);
}
