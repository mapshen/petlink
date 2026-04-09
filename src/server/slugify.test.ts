import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slugify, generateUniqueSlug } from './slugify.ts';

// Mock the db module
vi.mock('./db.ts', () => {
  const mockSql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      return mockSql._handler(strings, ...values);
    },
    {
      _handler: (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([]),
      _mockResult: (result: unknown[]) => {
        mockSql._handler = () => Promise.resolve(result);
      },
      _mockSequence: (results: unknown[][]) => {
        let callIndex = 0;
        mockSql._handler = () => {
          const result = results[callIndex] || [];
          callIndex++;
          return Promise.resolve(result);
        };
      },
    }
  );
  return { default: mockSql };
});

// Get reference to mock for controlling results
import sql from './db.ts';
const mockSql = sql as unknown as {
  _mockResult: (result: unknown[]) => void;
  _mockSequence: (results: unknown[][]) => void;
};

describe('slugify', () => {
  it('converts name to lowercase kebab-case', () => {
    expect(slugify('Bob Sitter')).toBe('bob-sitter');
  });

  it('removes apostrophes', () => {
    expect(slugify("O'Brien")).toBe('obrien');
  });

  it('replaces multiple spaces with single dash', () => {
    expect(slugify('Sarah  Jane  Martinez')).toBe('sarah-jane-martinez');
  });

  it('removes special characters', () => {
    expect(slugify('Bob (The Great) Sitter!')).toBe('bob-the-great-sitter');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('  Bob Sitter  ')).toBe('bob-sitter');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles unicode names', () => {
    expect(slugify('José García')).toBe('jos-garc-a');
  });
});

describe('generateUniqueSlug', () => {
  beforeEach(() => {
    mockSql._mockResult([]);
  });

  it('returns base slug when no collision exists', async () => {
    mockSql._mockResult([]); // no existing slug
    const slug = await generateUniqueSlug('Barkley');
    expect(slug).toBe('barkley');
  });

  it('defaults to users table', async () => {
    mockSql._mockResult([]);
    const slug = await generateUniqueSlug('Test');
    expect(slug).toBe('test');
  });

  it('appends suffix on collision for users table', async () => {
    mockSql._mockSequence([
      [{ id: 1 }], // base slug taken
      [],           // suffixed slug available
    ]);
    const slug = await generateUniqueSlug('Sarah');
    expect(slug).toMatch(/^sarah-[a-f0-9]{4}$/);
  });

  it('queries pets table when table param is pets', async () => {
    mockSql._mockResult([]);
    const slug = await generateUniqueSlug('Barkley', 'pets');
    expect(slug).toBe('barkley');
  });

  it('appends suffix on collision for pets table', async () => {
    mockSql._mockSequence([
      [{ id: 1 }], // base slug taken
      [],           // suffixed slug available
    ]);
    const slug = await generateUniqueSlug('Barkley', 'pets');
    expect(slug).toMatch(/^barkley-[a-f0-9]{4}$/);
  });

  it('uses pet- prefix fallback for empty name on pets table', async () => {
    const slug = await generateUniqueSlug('', 'pets');
    expect(slug).toMatch(/^pet-[a-f0-9]{4}$/);
  });

  it('uses sitter- prefix fallback for empty name on users table', async () => {
    const slug = await generateUniqueSlug('', 'users');
    expect(slug).toMatch(/^sitter-[a-f0-9]{4}$/);
  });

  it('excludes current record by id', async () => {
    mockSql._mockResult([]); // slug available after excluding self
    const slug = await generateUniqueSlug('Barkley', 'pets', 5);
    expect(slug).toBe('barkley');
  });
});
