import { describe, it, expect } from 'vitest';
import { availabilitySchema, verificationUpdateSchema, createSitterPostSchema } from './validation.ts';

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

describe('createSitterPostSchema', () => {
  it('accepts content-only post', () => {
    const result = createSitterPostSchema.safeParse({ content: 'Hello world' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.post_type).toBe('update');
  });

  it('accepts photo-only post', () => {
    const result = createSitterPostSchema.safeParse({ photo_url: 'https://example.com/photo.jpg' });
    expect(result.success).toBe(true);
  });

  it('accepts video-only post', () => {
    const result = createSitterPostSchema.safeParse({ video_url: 'https://example.com/video.mp4' });
    expect(result.success).toBe(true);
  });

  it('accepts post with content and photo', () => {
    const result = createSitterPostSchema.safeParse({ content: 'Nice day!', photo_url: 'https://example.com/photo.jpg', post_type: 'walk_photo' });
    expect(result.success).toBe(true);
  });

  it('rejects empty post (no content, photo, or video)', () => {
    const result = createSitterPostSchema.safeParse({ post_type: 'update' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 2000 characters', () => {
    const result = createSitterPostSchema.safeParse({ content: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    const result = createSitterPostSchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP photo URL', () => {
    const result = createSitterPostSchema.safeParse({ photo_url: 'http://example.com/photo.jpg' });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP video URL', () => {
    const result = createSitterPostSchema.safeParse({ video_url: 'http://example.com/video.mp4' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid post_type', () => {
    const result = createSitterPostSchema.safeParse({ content: 'Hi', post_type: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid post_type values', () => {
    for (const type of ['update', 'walk_photo', 'walk_video', 'care_update']) {
      const result = createSitterPostSchema.safeParse({ content: 'Hi', post_type: type });
      expect(result.success).toBe(true);
    }
  });

  it('defaults post_type to update', () => {
    const result = createSitterPostSchema.safeParse({ content: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.post_type).toBe('update');
  });

  it('trims content whitespace', () => {
    const result = createSitterPostSchema.safeParse({ content: '  Hello  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe('Hello');
  });
});
