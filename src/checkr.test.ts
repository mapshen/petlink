import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature, mapCheckrStatus, parseWebhookEvent } from './checkr.ts';
import crypto from 'crypto';

describe('mapCheckrStatus', () => {
  it('maps complete + clear to passed', () => {
    expect(mapCheckrStatus('complete', 'clear')).toBe('passed');
  });

  it('maps complete + consider to failed', () => {
    expect(mapCheckrStatus('complete', 'consider')).toBe('failed');
  });

  it('maps complete + engaged adjudication to passed', () => {
    expect(mapCheckrStatus('complete', 'consider', 'engaged')).toBe('passed');
  });

  it('maps complete + null result to failed', () => {
    expect(mapCheckrStatus('complete', null)).toBe('failed');
  });

  it('maps pending to submitted', () => {
    expect(mapCheckrStatus('pending', null)).toBe('submitted');
  });

  it('maps suspended to submitted', () => {
    expect(mapCheckrStatus('suspended', null)).toBe('submitted');
  });

  it('maps dispute to submitted', () => {
    expect(mapCheckrStatus('dispute', null)).toBe('submitted');
  });
});

describe('verifyWebhookSignature', () => {
  it('verifies a valid signature', () => {
    const secret = 'test-secret-key';
    const payload = '{"type":"report.completed"}';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const secret = 'test-secret-key';
    const payload = '{"type":"report.completed"}';
    const badSignature = 'a'.repeat(64);

    expect(verifyWebhookSignature(payload, badSignature, secret)).toBe(false);
  });
});

describe('parseWebhookEvent', () => {
  it('parses a valid Checkr webhook event', () => {
    const event = parseWebhookEvent({
      id: 'evt_123',
      type: 'report.completed',
      data: {
        object: {
          id: 'rep_123',
          status: 'complete',
          result: 'clear',
          candidate_id: 'cand_123',
          package: 'tasker_standard',
        },
      },
    });
    expect(event).not.toBeNull();
    expect(event?.type).toBe('report.completed');
    expect(event?.data.object.candidate_id).toBe('cand_123');
  });

  it('returns null for invalid body', () => {
    expect(parseWebhookEvent(null)).toBeNull();
    expect(parseWebhookEvent(undefined)).toBeNull();
    expect(parseWebhookEvent('string')).toBeNull();
    expect(parseWebhookEvent({})).toBeNull();
    expect(parseWebhookEvent({ type: 'test' })).toBeNull();
  });
});
