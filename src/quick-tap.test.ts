import { describe, it, expect } from 'vitest';
import { quickTapEventSchema } from './validation.ts';

describe('quickTapEventSchema', () => {
  it('accepts all valid event types', () => {
    const types = ['start', 'pee', 'poop', 'photo', 'end', 'fed', 'water', 'medication', 'nap_start', 'nap_end', 'play', 'video'];
    for (const event_type of types) {
      expect(quickTapEventSchema.safeParse({ event_type }).success).toBe(true);
    }
  });

  it('rejects invalid event type', () => {
    expect(quickTapEventSchema.safeParse({ event_type: 'dance' }).success).toBe(false);
  });

  it('accepts GPS coordinates', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'pee',
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid lat/lng', () => {
    expect(quickTapEventSchema.safeParse({ event_type: 'pee', lat: 91 }).success).toBe(false);
    expect(quickTapEventSchema.safeParse({ event_type: 'pee', lng: 181 }).success).toBe(false);
  });

  it('accepts optional note', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'fed',
      note: 'Used the blue bowl',
    });
    expect(result.success).toBe(true);
  });

  it('rejects note over 500 chars', () => {
    expect(quickTapEventSchema.safeParse({ event_type: 'fed', note: 'a'.repeat(501) }).success).toBe(false);
  });

  it('accepts pet_id', () => {
    const result = quickTapEventSchema.safeParse({ event_type: 'medication', pet_id: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts null optional fields', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'play',
      lat: null,
      lng: null,
      note: null,
      photo_url: null,
      video_url: null,
      pet_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts video event type', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'video',
      video_url: 'https://s3.example.com/videos/1/clip.mp4',
    });
    expect(result.success).toBe(true);
  });

  it('accepts video_url as valid URL', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'video',
      video_url: 'https://bucket.s3.us-east-1.amazonaws.com/videos/123/abc.mp4',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.video_url).toBe('https://bucket.s3.us-east-1.amazonaws.com/videos/123/abc.mp4');
    }
  });

  it('rejects invalid video_url', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'video',
      video_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects video_url as empty string', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'video',
      video_url: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-HTTPS video_url', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'video',
      video_url: 'http://bucket.s3.us-east-1.amazonaws.com/videos/123/abc.mp4',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-HTTPS photo_url', () => {
    const result = quickTapEventSchema.safeParse({
      event_type: 'photo',
      photo_url: 'http://bucket.s3.us-east-1.amazonaws.com/walks/123/abc.jpg',
    });
    expect(result.success).toBe(false);
  });
});
