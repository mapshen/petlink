import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before imports
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import { authMiddleware, signToken, verifyToken, type AuthenticatedRequest } from './auth.ts';
const mockedSql = mockSqlFn;

function mockReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return { headers } as AuthenticatedRequest;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects request without Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects request with non-Bearer header', async () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects request with invalid token', async () => {
    const req = mockReq({ authorization: 'Bearer invalid-token' });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects valid token for non-existent user', async () => {
    const token = signToken({ userId: 999 });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn();

    mockedSql.mockResolvedValueOnce([] as any);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets userId for valid token with existing user', async () => {
    const token = signToken({ userId: 42 });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn();

    mockedSql.mockResolvedValueOnce([{ id: 42 }] as any);

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(42);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockedSql).toHaveBeenCalledTimes(1);
  });
});

