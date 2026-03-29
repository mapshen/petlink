import { describe, it, expect } from 'vitest';
import {
  notificationPreferencesSchema,
  paymentIntentSchema,
  paymentActionSchema,
  applyProfileSchema,
  signedUrlSchema,
  sitterSearchSchema,
  profileViewSchema,
} from './validation.ts';

describe('notificationPreferencesSchema', () => {
  it('accepts all boolean fields', () => {
    const result = notificationPreferencesSchema.safeParse({
      email_enabled: true, new_booking: false, booking_status: true,
      new_message: true, walk_updates: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all optional)', () => {
    const result = notificationPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean values', () => {
    const result = notificationPreferencesSchema.safeParse({ email_enabled: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('paymentIntentSchema', () => {
  it('accepts valid booking_id', () => {
    const result = paymentIntentSchema.safeParse({ booking_id: 42 });
    expect(result.success).toBe(true);
  });

  it('accepts booking_id with payment_method', () => {
    const result = paymentIntentSchema.safeParse({ booking_id: 1, payment_method: 'ach_debit' });
    expect(result.success).toBe(true);
  });

  it('rejects missing booking_id', () => {
    const result = paymentIntentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-integer booking_id', () => {
    const result = paymentIntentSchema.safeParse({ booking_id: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects zero booking_id', () => {
    const result = paymentIntentSchema.safeParse({ booking_id: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid payment_method', () => {
    const result = paymentIntentSchema.safeParse({ booking_id: 1, payment_method: 'bitcoin' });
    expect(result.success).toBe(false);
  });
});

describe('paymentActionSchema', () => {
  it('accepts valid booking_id', () => {
    const result = paymentActionSchema.safeParse({ booking_id: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects negative booking_id', () => {
    const result = paymentActionSchema.safeParse({ booking_id: -1 });
    expect(result.success).toBe(false);
  });
});

describe('applyProfileSchema', () => {
  it('accepts valid profile_id', () => {
    const result = applyProfileSchema.safeParse({ profile_id: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects missing profile_id', () => {
    const result = applyProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects string profile_id', () => {
    const result = applyProfileSchema.safeParse({ profile_id: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('signedUrlSchema', () => {
  it('accepts valid upload params with fileSize', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'pets', contentType: 'image/jpeg', fileSize: 1024,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fileSize', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'pets', contentType: 'image/jpeg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid folder', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'secrets', contentType: 'image/jpeg', fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid contentType', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'pets', contentType: 'application/json', fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero fileSize', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'pets', contentType: 'image/jpeg', fileSize: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts video folder with video content type', () => {
    const result = signedUrlSchema.safeParse({
      folder: 'videos', contentType: 'video/mp4', fileSize: 5000000,
    });
    expect(result.success).toBe(true);
  });
});

describe('sitterSearchSchema', () => {
  it('accepts valid params', () => {
    const result = sitterSearchSchema.safeParse({
      serviceType: 'walking',
      lat: '40.7128',
      lng: '-74.006',
      radius: '50',
      minPrice: '10',
      maxPrice: '100',
      petSize: 'large',
      species: 'dog',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      serviceType: 'walking',
      lat: 40.7128,
      lng: -74.006,
      radius: 50,
      minPrice: 10,
      maxPrice: 100,
      petSize: 'large',
      species: 'dog',
    });
  });

  it('accepts empty object (all optional)', () => {
    const result = sitterSearchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects lat > 90', () => {
    const result = sitterSearchSchema.safeParse({ lat: '91' });
    expect(result.success).toBe(false);
  });

  it('rejects lat < -90', () => {
    const result = sitterSearchSchema.safeParse({ lat: '-91' });
    expect(result.success).toBe(false);
  });

  it('rejects lng > 180', () => {
    const result = sitterSearchSchema.safeParse({ lng: '181' });
    expect(result.success).toBe(false);
  });

  it('rejects lng < -180', () => {
    const result = sitterSearchSchema.safeParse({ lng: '-181' });
    expect(result.success).toBe(false);
  });

  it('rejects NaN coercion for lat', () => {
    const result = sitterSearchSchema.safeParse({ lat: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects NaN coercion for radius', () => {
    const result = sitterSearchSchema.safeParse({ radius: 'xyz' });
    expect(result.success).toBe(false);
  });

  it('rejects radius below 1', () => {
    const result = sitterSearchSchema.safeParse({ radius: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects radius above 500', () => {
    const result = sitterSearchSchema.safeParse({ radius: '501' });
    expect(result.success).toBe(false);
  });
});

describe('profileViewSchema', () => {
  it('accepts valid body', () => {
    const result = profileViewSchema.safeParse({
      source: 'search',
      session_id: 'abc-123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all optional)', () => {
    const result = profileViewSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects oversized session_id', () => {
    const result = profileViewSchema.safeParse({
      session_id: 'x'.repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized source', () => {
    const result = profileViewSchema.safeParse({
      source: 'x'.repeat(33),
    });
    expect(result.success).toBe(false);
  });
});
