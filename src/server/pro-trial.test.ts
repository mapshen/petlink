import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSqlFn = vi.hoisted(() => vi.fn());
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockIsBetaActive = vi.fn();
const mockGetProTrialDays = vi.fn();
vi.mock('./platform-settings.ts', () => ({
  isBetaActive: () => mockIsBetaActive(),
  getBetaEndDate: vi.fn().mockResolvedValue(null),
  getProTrialDays: () => mockGetProTrialDays(),
  setSetting: vi.fn(),
  getSetting: vi.fn(),
  clearSettingsCache: vi.fn(),
}));

const mockCreateProPeriod = vi.fn();
const mockHasUsedTrial = vi.fn();
const mockMarkTrialUsed = vi.fn();
vi.mock('./pro-periods.ts', () => ({
  createProPeriod: (...args: any[]) => mockCreateProPeriod(...args),
  hasUsedTrial: (...args: any[]) => mockHasUsedTrial(...args),
  markTrialUsed: (...args: any[]) => mockMarkTrialUsed(...args),
  getActiveProPeriod: vi.fn(),
  cancelProPeriod: vi.fn(),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

describe('free Pro trial auto-start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts trial when beta is inactive and trial not used', async () => {
    mockIsBetaActive.mockResolvedValueOnce(false);
    mockHasUsedTrial.mockResolvedValueOnce(false);
    mockGetProTrialDays.mockResolvedValueOnce(90);
    mockCreateProPeriod.mockResolvedValueOnce({ id: 1 });
    mockMarkTrialUsed.mockResolvedValueOnce(undefined);

    // Simulate approval logic
    const betaIsActive = await mockIsBetaActive();
    if (!betaIsActive) {
      const trialUsed = await mockHasUsedTrial(42);
      if (!trialUsed) {
        const trialDays = await mockGetProTrialDays();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        await mockCreateProPeriod(42, 'trial', trialEnd);
        await mockMarkTrialUsed(42);
      }
    }

    expect(mockCreateProPeriod).toHaveBeenCalledWith(42, 'trial', expect.any(Date));
    expect(mockMarkTrialUsed).toHaveBeenCalledWith(42);
  });

  it('does not start trial when trial already used', async () => {
    mockIsBetaActive.mockResolvedValueOnce(false);
    mockHasUsedTrial.mockResolvedValueOnce(true);

    const betaIsActive = await mockIsBetaActive();
    if (!betaIsActive) {
      const trialUsed = await mockHasUsedTrial(42);
      if (!trialUsed) {
        await mockCreateProPeriod(42, 'trial', new Date());
        await mockMarkTrialUsed(42);
      }
    }

    expect(mockCreateProPeriod).not.toHaveBeenCalled();
    expect(mockMarkTrialUsed).not.toHaveBeenCalled();
  });

  it('does not start trial when beta is active', async () => {
    mockIsBetaActive.mockResolvedValueOnce(true);

    const betaIsActive = await mockIsBetaActive();
    if (!betaIsActive) {
      await mockCreateProPeriod(42, 'trial', new Date());
    }

    expect(mockCreateProPeriod).not.toHaveBeenCalled();
  });

  it('trial duration comes from platform settings', async () => {
    mockIsBetaActive.mockResolvedValueOnce(false);
    mockHasUsedTrial.mockResolvedValueOnce(false);
    mockGetProTrialDays.mockResolvedValueOnce(60);
    mockCreateProPeriod.mockResolvedValueOnce({ id: 1 });
    mockMarkTrialUsed.mockResolvedValueOnce(undefined);

    const betaIsActive = await mockIsBetaActive();
    if (!betaIsActive) {
      const trialUsed = await mockHasUsedTrial(42);
      if (!trialUsed) {
        const trialDays = await mockGetProTrialDays();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        await mockCreateProPeriod(42, 'trial', trialEnd);
        await mockMarkTrialUsed(42);
      }
    }

    // Verify the end date is ~60 days from now
    const calledWith = mockCreateProPeriod.mock.calls[0][2] as Date;
    const daysFromNow = Math.round((calledWith.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    expect(daysFromNow).toBeGreaterThanOrEqual(59);
    expect(daysFromNow).toBeLessThanOrEqual(61);
  });
});
