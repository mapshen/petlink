import { describe, it, expect } from 'vitest';
import { availabilitySchema, verificationUpdateSchema } from './validation.ts';

describe('availabilitySchema', () => {
  const valid = {
    day_of_week: 1,
    specific_date: null,
    start_time: '09:00',
    end_time: '17:00',
    recurring: true,
  };

  it('accepts valid recurring availability', () => {
    const result = availabilitySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts valid specific-date availability', () => {
    const result = availabilitySchema.safeParse({
      day_of_week: null,
      specific_date: '2026-03-25',
      start_time: '10:00',
      end_time: '14:00',
    });
    expect(result.success).toBe(true);
  });

  it('accepts HH:MM:SS time format', () => {
    const result = availabilitySchema.safeParse({
      ...valid,
      start_time: '09:00:00',
      end_time: '17:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing start_time', () => {
    const { start_time, ...rest } = valid;
    const result = availabilitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing end_time', () => {
    const { end_time, ...rest } = valid;
    const result = availabilitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid time format', () => {
    const result = availabilitySchema.safeParse({ ...valid, start_time: '9am' });
    expect(result.success).toBe(false);
  });

  it('rejects end_time before start_time', () => {
    const result = availabilitySchema.safeParse({ ...valid, start_time: '17:00', end_time: '09:00' });
    expect(result.success).toBe(false);
  });

  it('rejects end_time equal to start_time', () => {
    const result = availabilitySchema.safeParse({ ...valid, start_time: '09:00', end_time: '09:00' });
    expect(result.success).toBe(false);
  });

  it('rejects day_of_week outside 0-6', () => {
    const result = availabilitySchema.safeParse({ ...valid, day_of_week: 7 });
    expect(result.success).toBe(false);
  });

  it('rejects negative day_of_week', () => {
    const result = availabilitySchema.safeParse({ ...valid, day_of_week: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid specific_date format', () => {
    const result = availabilitySchema.safeParse({
      ...valid,
      day_of_week: null,
      specific_date: '03-25-2026',
    });
    expect(result.success).toBe(false);
  });

  it('requires at least day_of_week or specific_date', () => {
    const result = availabilitySchema.safeParse({
      day_of_week: null,
      specific_date: null,
      start_time: '09:00',
      end_time: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts day_of_week 0 (Sunday)', () => {
    const result = availabilitySchema.safeParse({ ...valid, day_of_week: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts day_of_week 6 (Saturday)', () => {
    const result = availabilitySchema.safeParse({ ...valid, day_of_week: 6 });
    expect(result.success).toBe(true);
  });
});

describe('verificationUpdateSchema', () => {
  it('accepts valid HTTPS URL', () => {
    const result = verificationUpdateSchema.safeParse({
      house_photos_url: 'https://bucket.s3.amazonaws.com/photos/house.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects HTTP URL', () => {
    const result = verificationUpdateSchema.safeParse({
      house_photos_url: 'http://example.com/photo.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL string', () => {
    const result = verificationUpdateSchema.safeParse({
      house_photos_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing house_photos_url', () => {
    const result = verificationUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects URL exceeding 2048 characters', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2040);
    const result = verificationUpdateSchema.safeParse({ house_photos_url: longUrl });
    expect(result.success).toBe(false);
  });
});
