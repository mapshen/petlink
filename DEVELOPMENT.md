# Development Guide

## Prerequisites

- Node.js LTS (20+)
- PostgreSQL 15+ with PostGIS extension
- (Optional) Stripe account for payment testing
- (Optional) AWS S3 or MinIO for media uploads

## Setup

```bash
git clone git@github.com:mapshen/petlink.git
cd petlink
npm install
cp .env.example .env   # Edit with your PostgreSQL connection string
npm run dev             # Express + Vite HMR on http://localhost:3000
```

### Database Setup

```bash
createdb petlink
psql petlink -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

The app auto-creates tables and seeds demo data on first run. Demo accounts (password: `password123`):
- `owner@example.com` (owner role)
- `sitter@example.com` (sitter role)
- `dual@example.com` (both roles)

## Commands

```bash
npm run dev          # Start dev server (Express + Vite HMR on :3000)
npm run build        # Production build (Vite)
npm run lint         # Type-check (tsc --noEmit)
npm run test         # Run all tests (Vitest)
npm run test:watch   # Watch mode for TDD
npm run clean        # Remove dist/
```

## Testing

### Test Runner

All tests use **Vitest**. Test files live alongside source files as `*.test.ts`.

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode for TDD
npx vitest run --coverage   # With coverage report
```

### Current Test Suites

| Suite | Tests | Scope |
|-------|-------|-------|
| `src/auth.test.ts` | 6 | Password hashing, JWT sign/verify |
| `src/reviews.test.ts` | 3 | Double-blind review DB logic |
| `src/payments.test.ts` | 6 | Stripe Connect functions (mocked) |
| `src/notifications.test.ts` | 4 | Notification DB operations |
| `src/storage.test.ts` | 2 | S3 signed URL generation (mocked) |

### Testing Strategy

| Layer | Tool | Scope | Target Coverage |
|-------|------|-------|-----------------|
| Unit | Vitest | Utilities, services, pure functions | 80%+ |
| Integration | Vitest + supertest | API endpoints, middleware, DB queries | 80%+ |
| E2E | Playwright | Critical user flows | Key paths |

### Writing Tests

**File naming**: `src/<module>.test.ts` alongside the source file.

**Test structure**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something specific', () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expectedOutput);
  });
});
```

**Mocking external services** (Stripe, S3):
```typescript
import { vi } from 'vitest';

vi.mock('stripe', () => ({
  default: class MockStripe {
    paymentIntents = {
      create: vi.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'secret' }),
    };
  },
}));
```

**Database tests**: Use `better-sqlite3` in-memory databases (devDependency) to test SQL logic without requiring a running PostgreSQL instance:
```typescript
import Database from 'better-sqlite3';

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ...`);
  return db;
}
```

## Development Practices

### Test-Driven Development

**Mandatory workflow:**
1. Write test first (RED)
2. Run test — it should FAIL
3. Write minimal code to pass (GREEN)
4. Run test — it should PASS
5. Refactor while keeping tests green (IMPROVE)
6. Verify 80%+ coverage

### Code Quality

- **TypeScript strict mode** — all source files are `.ts` / `.tsx`
- **Immutability** — create new objects, never mutate
- **Small files** — 200-400 lines typical, 800 max
- **Small functions** — under 50 lines
- **No console.log** — remove before commit
- **No hardcoded values** — use environment variables for secrets and config
- **Parameterized queries** — all PostgreSQL queries use tagged template literals (zero SQL injection risk)

### API Design

- **Versioned**: All routes under `/api/v1/` (backwards-compatible `/api/` mount)
- **Auth**: JWT Bearer tokens in `Authorization` header
- **Errors**: `{ error: string }` response body
- **Validation**: Validate all input at system boundaries (see `docs/VALIDATION_GUIDE.md`)
- **Date/time**: ISO 8601 strings over the wire, `TIMESTAMPTZ` in PostgreSQL (see `docs/DATETIME_GUIDE.md`)

### Git Workflow

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
- **Never push to main** — always use pull requests
- **Branch naming**: `feat/`, `fix/`, `infra/`, `docs/` prefixes
- **Before opening a PR**: all tests pass, types check, docs updated if needed

### Date & Time Handling

All dates stored as UTC in PostgreSQL `TIMESTAMPTZ`. Display in user's local timezone. See `docs/DATETIME_GUIDE.md` for utilities, patterns, and rules.

### Validation

Dual-layer: Zod schemas on frontend (React Hook Form), validated again on backend. See `docs/VALIDATION_GUIDE.md` for architecture, helpers, and patterns.

### Security Checklist

Before any commit:
- [ ] No hardcoded secrets
- [ ] All user input validated
- [ ] Parameterized queries (tagged template literals)
- [ ] Auth middleware on protected endpoints
- [ ] Rate limiting on auth endpoints
- [ ] Error messages don't leak internals
