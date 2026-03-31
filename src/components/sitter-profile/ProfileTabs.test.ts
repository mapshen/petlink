import { describe, it, expect } from 'vitest';
import { TABS, type TabId } from './ProfileTabs';

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
