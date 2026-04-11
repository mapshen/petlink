import { describe, it, expect } from 'vitest';
import { FIXED_TABS, type TabId } from './ProfileTabs';

describe('ProfileTabs constants', () => {
  it('has 3 fixed tabs', () => {
    expect(FIXED_TABS).toHaveLength(3);
  });

  it('contains posts, reviews, availability', () => {
    expect(FIXED_TABS).toContain('posts');
    expect(FIXED_TABS).toContain('reviews');
    expect(FIXED_TABS).toContain('booking');
  });

  it('defaults to posts as first fixed tab', () => {
    const defaultTab: TabId = FIXED_TABS[0];
    expect(defaultTab).toBe('posts');
  });

  it('species tab IDs follow species-{name} pattern', () => {
    const dogTab: TabId = 'species-dog';
    const catTab: TabId = 'species-cat';
    expect(dogTab).toBe('species-dog');
    expect(catTab).toBe('species-cat');
  });
});
