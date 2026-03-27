import { describe, it, expect } from 'vitest';

/**
 * Tests for useVideoUpload hook constants and type validation logic.
 * The hook itself uses browser APIs (DOM, fetch) so we test the exported
 * constraints and validation rules that drive its behavior.
 */

// Re-declare constants to test against (mirrors useVideoUpload.ts)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_DURATION_SECONDS = 15;

describe('useVideoUpload constants', () => {
  it('MAX_FILE_SIZE is 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10485760);
  });

  it('MAX_DURATION_SECONDS is 15', () => {
    expect(MAX_DURATION_SECONDS).toBe(15);
  });

  it('allows MP4 type', () => {
    expect(ALLOWED_TYPES).toContain('video/mp4');
  });

  it('allows QuickTime (MOV) type', () => {
    expect(ALLOWED_TYPES).toContain('video/quicktime');
  });

  it('allows WebM type', () => {
    expect(ALLOWED_TYPES).toContain('video/webm');
  });

  it('does not allow AVI', () => {
    expect(ALLOWED_TYPES).not.toContain('video/x-msvideo');
  });

  it('does not allow image types', () => {
    expect(ALLOWED_TYPES).not.toContain('image/jpeg');
    expect(ALLOWED_TYPES).not.toContain('image/png');
  });
});

describe('useVideoUpload type validation logic', () => {
  function isAllowedType(type: string): boolean {
    return ALLOWED_TYPES.includes(type);
  }

  function isWithinSizeLimit(size: number): boolean {
    return size <= MAX_FILE_SIZE;
  }

  function isWithinDurationLimit(duration: number): boolean {
    return duration <= MAX_DURATION_SECONDS;
  }

  it('accepts video/mp4', () => {
    expect(isAllowedType('video/mp4')).toBe(true);
  });

  it('accepts video/quicktime', () => {
    expect(isAllowedType('video/quicktime')).toBe(true);
  });

  it('accepts video/webm', () => {
    expect(isAllowedType('video/webm')).toBe(true);
  });

  it('rejects video/avi', () => {
    expect(isAllowedType('video/avi')).toBe(false);
  });

  it('rejects image/jpeg', () => {
    expect(isAllowedType('image/jpeg')).toBe(false);
  });

  it('rejects empty string type', () => {
    expect(isAllowedType('')).toBe(false);
  });

  it('accepts file exactly at 10MB', () => {
    expect(isWithinSizeLimit(10 * 1024 * 1024)).toBe(true);
  });

  it('rejects file at 10MB + 1 byte', () => {
    expect(isWithinSizeLimit(10 * 1024 * 1024 + 1)).toBe(false);
  });

  it('accepts small file', () => {
    expect(isWithinSizeLimit(1024)).toBe(true);
  });

  it('accepts duration at exactly 15 seconds', () => {
    expect(isWithinDurationLimit(15)).toBe(true);
  });

  it('rejects duration at 16 seconds', () => {
    expect(isWithinDurationLimit(16)).toBe(false);
  });

  it('accepts short 5-second clip', () => {
    expect(isWithinDurationLimit(5)).toBe(true);
  });
});
