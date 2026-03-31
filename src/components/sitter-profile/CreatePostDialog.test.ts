import { describe, it, expect } from 'vitest';
import { validatePostContent } from './CreatePostDialog';

describe('validatePostContent', () => {
  it('accepts content with text only', () => {
    expect(validatePostContent({ content: 'Hello world' })).toBeNull();
  });

  it('accepts content with photo only', () => {
    expect(validatePostContent({ photoUrl: 'https://example.com/photo.jpg' })).toBeNull();
  });

  it('accepts content with video only', () => {
    expect(validatePostContent({ videoUrl: 'https://example.com/video.mp4' })).toBeNull();
  });

  it('accepts content with text and photo', () => {
    expect(validatePostContent({ content: 'Nice!', photoUrl: 'https://example.com/photo.jpg' })).toBeNull();
  });

  it('rejects empty post', () => {
    expect(validatePostContent({})).toBe('Post must have text, a photo, or a video');
  });

  it('rejects whitespace-only content', () => {
    expect(validatePostContent({ content: '   ' })).toBe('Post must have text, a photo, or a video');
  });

  it('rejects content over 2000 characters', () => {
    expect(validatePostContent({ content: 'a'.repeat(2001) })).toBe('Caption must be under 2000 characters');
  });

  it('accepts exactly 2000 characters', () => {
    expect(validatePostContent({ content: 'a'.repeat(2000) })).toBeNull();
  });
});
