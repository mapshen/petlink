import { describe, it, expect } from 'vitest';

const TABS = ['posts', 'reviews', 'availability'] as const;
type TabId = typeof TABS[number];

describe('ProfileTabs constants', () => {
  it('has 3 tabs', () => {
    expect(TABS).toHaveLength(3);
  });

  it('contains posts, reviews, availability', () => {
    expect(TABS).toContain('posts');
    expect(TABS).toContain('reviews');
    expect(TABS).toContain('availability');
  });

  it('defaults to posts as first tab', () => {
    const defaultTab: TabId = TABS[0];
    expect(defaultTab).toBe('posts');
  });
});
