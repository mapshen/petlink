import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  (sqlFn as any).begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(sqlFn));
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockCreateNotification = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('./notifications.ts', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}));

const mockSendEmail = vi.fn().mockResolvedValue({ id: 'email-1' });
const mockBuildBanActionEmail = vi.fn().mockReturnValue({ subject: 'Ban', html: '<p>Ban</p>' });
const mockBuildAppealResponseEmail = vi.fn().mockReturnValue({ subject: 'Appeal', html: '<p>Appeal</p>' });
vi.mock('./email.ts', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  buildBanActionEmail: (...args: any[]) => mockBuildBanActionEmail(...args),
  buildAppealResponseEmail: (...args: any[]) => mockBuildAppealResponseEmail(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  issueBanAction,
  getBanHistory,
  getEffectiveBanStatus,
  submitAppeal,
  listPendingAppeals,
  reviewAppeal,
  checkSuspensionExpiry,
} from './ban-actions.ts';

describe('ban-actions', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('issueBanAction', () => {
    it('inserts a warning and sends notification + email', async () => {
      const fakeAction = {
        id: 1, user_id: 10, action_type: 'warning', reason: 'policy_violation',
        description: 'First warning', issued_by: 99, issued_at: '2026-04-06', expires_at: null,
      };
      mockSqlFn.mockResolvedValueOnce([fakeAction]); // INSERT ban_action
      // No UPDATE for warnings
      mockSqlFn.mockResolvedValueOnce([{ email: 'user@test.com', name: 'Test User' }]); // SELECT user for email

      const result = await issueBanAction(10, 'warning', 'policy_violation', 'First warning', 99);
      expect(result.action_type).toBe('warning');
      expect(result.id).toBe(1);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Account Warning',
        expect.stringContaining('First warning'),
        expect.objectContaining({ ban_action_id: 1 })
      );
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it('inserts a suspension and updates user approval_status', async () => {
      const fakeAction = {
        id: 2, user_id: 10, action_type: 'suspension', reason: 'safety_violation',
        description: 'Temp ban', issued_by: 99, issued_at: '2026-04-06', expires_at: '2026-05-06',
      };
      mockSqlFn.mockResolvedValueOnce([fakeAction]); // INSERT ban_action
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users SET approval_status
      mockSqlFn.mockResolvedValueOnce([{ email: 'user@test.com', name: 'Test User' }]); // SELECT user

      const result = await issueBanAction(10, 'suspension', 'safety_violation', 'Temp ban', 99, new Date('2026-05-06'));
      expect(result.action_type).toBe('suspension');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Account Suspended',
        expect.stringContaining('Temp ban'),
        expect.any(Object)
      );
    });

    it('inserts a ban and updates user approval_status', async () => {
      const fakeAction = {
        id: 3, user_id: 10, action_type: 'ban', reason: 'fraud',
        description: 'Permanent ban', issued_by: 99, issued_at: '2026-04-06', expires_at: null,
      };
      mockSqlFn.mockResolvedValueOnce([fakeAction]); // INSERT ban_action
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users
      mockSqlFn.mockResolvedValueOnce([{ email: 'user@test.com', name: 'Test User' }]); // SELECT user

      const result = await issueBanAction(10, 'ban', 'fraud', 'Permanent ban', 99);
      expect(result.action_type).toBe('ban');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Account Banned',
        expect.stringContaining('Permanent ban'),
        expect.any(Object)
      );
    });

    it('handles missing user email gracefully', async () => {
      const fakeAction = { id: 4, user_id: 10, action_type: 'warning', reason: 'other', description: 'test', issued_by: 99 };
      mockSqlFn.mockResolvedValueOnce([fakeAction]); // INSERT
      mockSqlFn.mockResolvedValueOnce([]); // SELECT user — not found

      const result = await issueBanAction(10, 'warning', 'other', 'test', 99);
      expect(result.id).toBe(4);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('getBanHistory', () => {
    it('returns paginated ban history with total', async () => {
      const actions = [
        { id: 1, action_type: 'warning', reason: 'policy_violation', issued_by_name: 'Admin' },
        { id: 2, action_type: 'suspension', reason: 'safety_violation', issued_by_name: 'Admin' },
      ];
      mockSqlFn.mockResolvedValueOnce(actions); // SELECT ban_actions
      mockSqlFn.mockResolvedValueOnce([{ count: 2 }]); // SELECT count

      const result = await getBanHistory(10, 50, 0);
      expect(result.actions).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('returns empty list for user with no ban history', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // SELECT ban_actions
      mockSqlFn.mockResolvedValueOnce([{ count: 0 }]); // SELECT count

      const result = await getBanHistory(10);
      expect(result.actions).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getEffectiveBanStatus', () => {
    it('returns banned when permanent ban exists without approved appeal', async () => {
      const ban = { id: 1, action_type: 'ban', reason: 'fraud', user_id: 10 };
      mockSqlFn.mockResolvedValueOnce([ban]); // SELECT ban

      const result = await getEffectiveBanStatus(10);
      expect(result.status).toBe('banned');
      expect(result.action?.id).toBe(1);
    });

    it('returns suspended when active suspension exists', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no ban
      const suspension = { id: 2, action_type: 'suspension', user_id: 10, expires_at: '2026-05-06' };
      mockSqlFn.mockResolvedValueOnce([suspension]); // SELECT suspension

      const result = await getEffectiveBanStatus(10);
      expect(result.status).toBe('suspended');
    });

    it('returns warning when recent warning exists', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no ban
      mockSqlFn.mockResolvedValueOnce([]); // no suspension
      const warning = { id: 3, action_type: 'warning', user_id: 10 };
      mockSqlFn.mockResolvedValueOnce([warning]); // SELECT warning

      const result = await getEffectiveBanStatus(10);
      expect(result.status).toBe('warning');
    });

    it('returns clear when no actions exist', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no ban
      mockSqlFn.mockResolvedValueOnce([]); // no suspension
      mockSqlFn.mockResolvedValueOnce([]); // no warning

      const result = await getEffectiveBanStatus(10);
      expect(result.status).toBe('clear');
    });
  });

  describe('submitAppeal', () => {
    it('creates an appeal for a ban action', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, user_id: 10, action_type: 'ban' }]); // SELECT ban_action
      mockSqlFn.mockResolvedValueOnce([]); // SELECT existing appeal — none
      const fakeAppeal = { id: 1, user_id: 10, ban_action_id: 1, reason: 'I was wrongly banned', status: 'pending' };
      mockSqlFn.mockResolvedValueOnce([fakeAppeal]); // INSERT appeal

      const result = await submitAppeal(10, 1, 'I was wrongly banned');
      expect(result?.status).toBe('pending');
      expect(result?.ban_action_id).toBe(1);
    });

    it('returns null if ban action does not belong to user', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, user_id: 99, action_type: 'ban' }]); // wrong user

      const result = await submitAppeal(10, 1, 'Appeal text');
      expect(result).toBeNull();
    });

    it('returns null if action is a warning (not appealable)', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, user_id: 10, action_type: 'warning' }]);

      const result = await submitAppeal(10, 1, 'Appeal text');
      expect(result).toBeNull();
    });

    it('returns null if appeal already exists', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, user_id: 10, action_type: 'ban' }]); // ban action
      mockSqlFn.mockResolvedValueOnce([{ id: 99 }]); // existing appeal

      const result = await submitAppeal(10, 1, 'Appeal text');
      expect(result).toBeNull();
    });

    it('returns null if ban action does not exist', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no action found

      const result = await submitAppeal(10, 999, 'Appeal text');
      expect(result).toBeNull();
    });
  });

  describe('listPendingAppeals', () => {
    it('returns pending appeals with user and ban action details', async () => {
      const appeals = [{
        id: 1, user_id: 10, ban_action_id: 1, reason: 'wrongly banned',
        status: 'pending', user_name: 'Test', user_email: 'test@test.com',
        action_type: 'ban', ban_reason: 'fraud',
      }];
      mockSqlFn.mockResolvedValueOnce(appeals);
      mockSqlFn.mockResolvedValueOnce([{ count: 1 }]);

      const result = await listPendingAppeals();
      expect(result.appeals).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns empty when no pending appeals', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);

      const result = await listPendingAppeals();
      expect(result.appeals).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('reviewAppeal', () => {
    it('approves appeal and restores user access', async () => {
      const fakeAppeal = { id: 1, user_id: 10, ban_action_id: 1, status: 'approved' };
      mockSqlFn.mockResolvedValueOnce([fakeAppeal]); // UPDATE appeal
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users (restore)
      mockSqlFn.mockResolvedValueOnce([{ email: 'user@test.com', name: 'Test User' }]); // SELECT user for email

      const result = await reviewAppeal(1, 'approved', 'Reinstated after review', 99);
      expect(result?.status).toBe('approved');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Appeal Approved',
        expect.stringContaining('restored'),
        expect.any(Object)
      );
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it('denies appeal and sends notification', async () => {
      const fakeAppeal = { id: 2, user_id: 10, ban_action_id: 2, status: 'denied' };
      mockSqlFn.mockResolvedValueOnce([fakeAppeal]); // UPDATE appeal
      // No user restore for denial
      mockSqlFn.mockResolvedValueOnce([{ email: 'user@test.com', name: 'Test User' }]); // SELECT user for email

      const result = await reviewAppeal(2, 'denied', 'Evidence stands', 99);
      expect(result?.status).toBe('denied');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Appeal Denied',
        expect.stringContaining('Evidence stands'),
        expect.any(Object)
      );
    });

    it('returns null if appeal not found or already reviewed', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE returns nothing

      const result = await reviewAppeal(999, 'approved', 'test', 99);
      expect(result).toBeNull();
    });
  });

  describe('checkSuspensionExpiry', () => {
    it('restores user when suspension has expired and no active ban', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1 }]); // expired suspension found
      mockSqlFn.mockResolvedValueOnce([]); // no active non-expired suspension
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users
      // createNotification called

      const result = await checkSuspensionExpiry(10);
      expect(result).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        10, 'account_update', 'Suspension Expired',
        expect.any(String), expect.any(Object)
      );
    });

    it('returns false when no expired suspension', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no expired suspension

      const result = await checkSuspensionExpiry(10);
      expect(result).toBe(false);
    });

    it('returns false when suspension expired but another non-expired suspension exists', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1 }]); // expired suspension found
      mockSqlFn.mockResolvedValueOnce([{ id: 2 }]); // another active suspension

      const result = await checkSuspensionExpiry(10);
      expect(result).toBe(false);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });
});

describe('ban-action email templates', () => {
  let buildBanActionEmail: typeof import('./email.ts').buildBanActionEmail;
  let buildAppealResponseEmail: typeof import('./email.ts').buildAppealResponseEmail;

  beforeEach(async () => {
    vi.resetModules();
    const emailModule = await vi.importActual('./email.ts') as typeof import('./email.ts');
    buildBanActionEmail = emailModule.buildBanActionEmail;
    buildAppealResponseEmail = emailModule.buildAppealResponseEmail;
  });

  it('buildBanActionEmail generates warning email', () => {
    const result = buildBanActionEmail({
      userName: 'Alice',
      actionType: 'warning',
      reason: 'policy_violation',
      description: 'Late cancellation',
    });
    expect(result.subject).toContain('Warning');
    expect(result.html).toContain('Alice');
    expect(result.html).toContain('Late cancellation');
    expect(result.html).toContain('community guidelines');
  });

  it('buildBanActionEmail generates suspension email with expiry', () => {
    const result = buildBanActionEmail({
      userName: 'Bob',
      actionType: 'suspension',
      reason: 'safety_violation',
      description: 'Safety concern',
      expiresAt: new Date('2026-06-01'),
    });
    expect(result.subject).toContain('suspended');
    expect(result.html).toContain('Bob');
    expect(result.html).toContain('2026-06-01');
    expect(result.html).toContain('appeal');
  });

  it('buildBanActionEmail generates ban email', () => {
    const result = buildBanActionEmail({
      userName: 'Charlie',
      actionType: 'ban',
      reason: 'fraud',
      description: 'Fraudulent activity',
    });
    expect(result.subject).toContain('banned');
    expect(result.html).toContain('Charlie');
    expect(result.html).toContain('appeal');
  });

  it('buildBanActionEmail escapes HTML in user input', () => {
    const result = buildBanActionEmail({
      userName: '<script>alert("xss")</script>',
      actionType: 'warning',
      reason: 'other',
      description: '<img onerror=alert(1)>',
    });
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img onerror');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('buildAppealResponseEmail generates approved email', () => {
    const result = buildAppealResponseEmail({
      userName: 'Alice',
      status: 'approved',
      adminResponse: 'After review, we have restored your account.',
    });
    expect(result.subject).toContain('approved');
    expect(result.html).toContain('restored');
    expect(result.html).toContain('Welcome back');
  });

  it('buildAppealResponseEmail generates denied email', () => {
    const result = buildAppealResponseEmail({
      userName: 'Bob',
      status: 'denied',
      adminResponse: 'Evidence supports the original decision.',
    });
    expect(result.subject).toContain('appeal');
    expect(result.html).toContain('Denied');
    expect(result.html).toContain('Evidence supports');
  });

  it('buildAppealResponseEmail escapes HTML in admin response', () => {
    const result = buildAppealResponseEmail({
      userName: 'Alice',
      status: 'denied',
      adminResponse: '<script>hack</script>',
    });
    expect(result.html).not.toContain('<script>hack');
    expect(result.html).toContain('&lt;script&gt;');
  });
});

describe('ban-action validation schemas', () => {
  let banActionSchema: typeof import('./validation.ts').banActionSchema;
  let banAppealSchema: typeof import('./validation.ts').banAppealSchema;
  let appealReviewSchema: typeof import('./validation.ts').appealReviewSchema;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await vi.importActual('./validation.ts') as typeof import('./validation.ts');
    banActionSchema = mod.banActionSchema;
    banAppealSchema = mod.banAppealSchema;
    appealReviewSchema = mod.appealReviewSchema;
  });

  describe('banActionSchema', () => {
    it('accepts valid warning input', () => {
      const result = banActionSchema.safeParse({
        action_type: 'warning',
        reason: 'policy_violation',
        description: 'First warning for late cancellation',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid suspension with expires_at', () => {
      const result = banActionSchema.safeParse({
        action_type: 'suspension',
        reason: 'safety_violation',
        description: 'Temporary suspension',
        expires_at: '2026-06-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid action_type', () => {
      const result = banActionSchema.safeParse({
        action_type: 'timeout',
        reason: 'fraud',
        description: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid reason', () => {
      const result = banActionSchema.safeParse({
        action_type: 'warning',
        reason: 'bad_vibes',
        description: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty description', () => {
      const result = banActionSchema.safeParse({
        action_type: 'warning',
        reason: 'other',
        description: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects description over 1000 chars', () => {
      const result = banActionSchema.safeParse({
        action_type: 'warning',
        reason: 'other',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('banAppealSchema', () => {
    it('accepts valid appeal input', () => {
      const result = banAppealSchema.safeParse({
        ban_action_id: 1,
        reason: 'I believe this ban was issued incorrectly because...',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short reason', () => {
      const result = banAppealSchema.safeParse({
        ban_action_id: 1,
        reason: 'no',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing ban_action_id', () => {
      const result = banAppealSchema.safeParse({
        reason: 'Sufficient reason text here',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('appealReviewSchema', () => {
    it('accepts valid approval', () => {
      const result = appealReviewSchema.safeParse({
        status: 'approved',
        admin_response: 'Reinstated after further investigation',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid denial', () => {
      const result = appealReviewSchema.safeParse({
        status: 'denied',
        admin_response: 'Evidence supports original decision',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = appealReviewSchema.safeParse({
        status: 'maybe',
        admin_response: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty admin_response', () => {
      const result = appealReviewSchema.safeParse({
        status: 'denied',
        admin_response: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('ban-action routes', () => {
  let app: any;
  let request: any;

  const mockAdminUser = { id: 99, email: 'admin@example.com', name: 'Admin', roles: ['admin'], approval_status: 'approved', deleted_at: null };
  const mockRegularUser = { id: 10, email: 'user@example.com', name: 'User', roles: ['owner'], approval_status: 'approved', deleted_at: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import with fresh mocks
    const supertest = await import('supertest');
    const express = await import('express');

    app = express.default();
    app.use(express.default.json());

    // Set admin email env
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.JWT_SECRET = 'test-secret';

    // Token generation
    const jwt = await import('jsonwebtoken');

    // Mock SQL for auth + admin middleware
    mockSqlFn.mockImplementation((..._args: any[]) => {
      // Default: return empty
      return Promise.resolve([]);
    });

    const { default: banActionRoutes } = await import('./routes/ban-actions.ts');
    const routerModule = await import('express');
    const router = routerModule.default.Router();
    banActionRoutes(router);
    app.use('/api/v1', router);

    request = supertest.default(app);
  });

  // Route tests use integration-style but rely on mocked DB
  // The important behavior is tested in the unit tests above
  // These verify the route wiring and HTTP status codes

  it('GET /api/v1/ban-status/me returns 401 without auth', async () => {
    const res = await request.get('/api/v1/ban-status/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/ban-appeals returns 401 without auth', async () => {
    const res = await request.post('/api/v1/ban-appeals').send({
      ban_action_id: 1,
      reason: 'This is my appeal reason text',
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/admin/users/10/ban-action returns 401 without auth', async () => {
    const res = await request.post('/api/v1/admin/users/10/ban-action').send({
      action_type: 'warning',
      reason: 'other',
      description: 'test',
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/admin/appeals returns 401 without auth', async () => {
    const res = await request.get('/api/v1/admin/appeals');
    expect(res.status).toBe(401);
  });
});
