import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockIssueCredit = vi.fn();
vi.mock('./credits.ts', () => ({ issueCredit: (...args: any[]) => mockIssueCredit(...args) }));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: any) => e,
}));

import {
  checkMentorEligibility,
  monthsBetween,
  enrollAsMentor,
  unenrollAsMentor,
  requestMentorship,
  getMentorships,
  checkMentorshipCompletion,
  adminCompleteMentorship,
  cancelMentorship,
  getAvailableMentors,
  MENTOR_CREDIT_CENTS,
  MENTEE_CREDIT_CENTS,
  MIN_COMPLETED_BOOKINGS,
  MIN_AVG_RATING,
  MIN_MONTHS_ON_PLATFORM,
  MENTEE_COMPLETION_BOOKINGS,
  MENTEE_ELIGIBILITY_DAYS,
  MAX_ACTIVE_MENTORSHIPS_PER_MENTOR,
} from './mentorships.ts';

describe('mentorships', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- Constants ---
  describe('constants', () => {
    it('has correct credit amounts', () => {
      expect(MENTOR_CREDIT_CENTS).toBe(1500); // $15
      expect(MENTEE_CREDIT_CENTS).toBe(500);  // $5
    });

    it('has correct thresholds', () => {
      expect(MIN_COMPLETED_BOOKINGS).toBe(10);
      expect(MIN_AVG_RATING).toBe(4.5);
      expect(MIN_MONTHS_ON_PLATFORM).toBe(3);
      expect(MENTEE_COMPLETION_BOOKINGS).toBe(3);
      expect(MENTEE_ELIGIBILITY_DAYS).toBe(30);
      expect(MAX_ACTIVE_MENTORSHIPS_PER_MENTOR).toBe(3);
    });
  });

  // --- monthsBetween ---
  describe('monthsBetween', () => {
    it('computes months between two dates', () => {
      const a = new Date('2026-01-15');
      const b = new Date('2026-04-15');
      expect(monthsBetween(a, b)).toBe(3);
    });

    it('returns 0 for same month', () => {
      const a = new Date('2026-04-01T12:00:00Z');
      const b = new Date('2026-04-28T12:00:00Z');
      expect(monthsBetween(a, b)).toBe(0);
    });

    it('handles cross-year', () => {
      const a = new Date('2025-11-01');
      const b = new Date('2026-02-01');
      expect(monthsBetween(a, b)).toBe(3);
    });
  });

  // --- checkMentorEligibility (pure) ---
  describe('checkMentorEligibility', () => {
    const validStats = {
      approval_status: 'approved',
      roles: ['owner', 'sitter'],
      completed_bookings: 15,
      avg_rating: 4.8,
      created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // ~4 months ago
    };

    it('returns eligible for a qualified sitter', () => {
      const result = checkMentorEligibility(validStats);
      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('rejects non-sitter', () => {
      const result = checkMentorEligibility({ ...validStats, roles: ['owner'] });
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('Must have the sitter role');
    });

    it('rejects non-approved sitter', () => {
      const result = checkMentorEligibility({ ...validStats, approval_status: 'pending_approval' });
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('Must have approved status');
    });

    it('rejects insufficient bookings', () => {
      const result = checkMentorEligibility({ ...validStats, completed_bookings: 5 });
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain('at least 10 completed bookings');
    });

    it('rejects low rating', () => {
      const result = checkMentorEligibility({ ...validStats, avg_rating: 3.9 });
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain('4.5+ average rating');
    });

    it('rejects null rating', () => {
      const result = checkMentorEligibility({ ...validStats, avg_rating: null });
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain('4.5+ average rating (have none)');
    });

    it('rejects new account (less than 3 months)', () => {
      const result = checkMentorEligibility({
        ...validStats,
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain('3+ months on platform');
    });

    it('returns multiple reasons when multiple criteria fail', () => {
      const result = checkMentorEligibility({
        approval_status: 'pending_approval',
        roles: ['owner'],
        completed_bookings: 2,
        avg_rating: null,
        created_at: new Date().toISOString(),
      });
      expect(result.eligible).toBe(false);
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    });
  });

  // --- enrollAsMentor ---
  describe('enrollAsMentor', () => {
    it('enrolls an eligible sitter', async () => {
      // getMentorEligibilityStats mocks
      mockSqlFn.mockResolvedValueOnce([{
        approval_status: 'approved',
        roles: ['owner', 'sitter'],
        created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ completed_bookings: 15 }]);
      mockSqlFn.mockResolvedValueOnce([{ avg_rating: 4.8 }]);
      // Update
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await enrollAsMentor(1);
      expect(result.success).toBe(true);
    });

    it('rejects ineligible sitter', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        approval_status: 'approved',
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ completed_bookings: 2 }]);
      mockSqlFn.mockResolvedValueOnce([{ avg_rating: 3.0 }]);

      const result = await enrollAsMentor(1);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // --- unenrollAsMentor ---
  describe('unenrollAsMentor', () => {
    it('sets is_mentor to false', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      await unenrollAsMentor(1);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });
  });

  // --- getAvailableMentors ---
  describe('getAvailableMentors', () => {
    it('returns mentors sorted by completed bookings', async () => {
      const mentors = [
        { id: 1, name: 'Alice', completed_bookings: 20, avg_rating: 4.9, active_mentee_count: 0 },
        { id: 2, name: 'Bob', completed_bookings: 15, avg_rating: 4.7, active_mentee_count: 1 },
      ];
      mockSqlFn.mockResolvedValueOnce(mentors);

      const result = await getAvailableMentors();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
    });

    it('returns mentors sorted by distance when coords provided', async () => {
      const mentors = [
        { id: 2, name: 'Bob', distance_meters: 500, active_mentee_count: 0 },
        { id: 1, name: 'Alice', distance_meters: 1200, active_mentee_count: 1 },
      ];
      mockSqlFn.mockResolvedValueOnce(mentors);

      const result = await getAvailableMentors({ lat: 40.7, lng: -73.9 });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bob');
    });
  });

  // --- requestMentorship ---
  describe('requestMentorship', () => {
    it('creates mentorship for valid mentee and mentor', async () => {
      // Mentee user
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      // Mentor user
      mockSqlFn.mockResolvedValueOnce([{ id: 2, is_mentor: true, approval_status: 'approved' }]);
      // Active mentee count
      mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
      // Existing active mentorship
      mockSqlFn.mockResolvedValueOnce([]);
      // Insert
      mockSqlFn.mockResolvedValueOnce([{ id: 1, mentor_id: 2, mentee_id: 1, status: 'active' }]);

      const result = await requestMentorship(1, 2, 'Looking forward to learning!');
      expect(result.success).toBe(true);
      expect(result.mentorship?.status).toBe('active');
    });

    it('rejects non-sitter mentee', async () => {
      mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'], created_at: new Date().toISOString() }]);

      const result = await requestMentorship(1, 2);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mentee must be a sitter');
    });

    it('rejects mentee older than 30 days', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      }]);

      const result = await requestMentorship(1, 2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('first 30 days');
    });

    it('rejects unavailable mentor', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 2, is_mentor: false, approval_status: 'approved' }]);

      const result = await requestMentorship(1, 2);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Selected mentor is not available');
    });

    it('rejects when mentor at capacity', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 2, is_mentor: true, approval_status: 'approved' }]);
      mockSqlFn.mockResolvedValueOnce([{ count: 3 }]);

      const result = await requestMentorship(1, 2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum number');
    });

    it('rejects duplicate active mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 2, is_mentor: true, approval_status: 'approved' }]);
      mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 99 }]); // existing

      const result = await requestMentorship(1, 2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already have an active mentorship');
    });

    it('rejects self-mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        roles: ['owner', 'sitter'],
        created_at: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 1, is_mentor: true, approval_status: 'approved' }]);
      mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
      mockSqlFn.mockResolvedValueOnce([]); // no existing

      const result = await requestMentorship(1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot mentor yourself');
    });
  });

  // --- getMentorships ---
  describe('getMentorships', () => {
    it('returns mentorships as mentor and mentee', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, mentee_name: 'Newbie' }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 2, mentor_name: 'Pro' }]);

      const result = await getMentorships(1);
      expect(result.as_mentor).toHaveLength(1);
      expect(result.as_mentee).toHaveLength(1);
    });
  });

  // --- checkMentorshipCompletion ---
  describe('checkMentorshipCompletion', () => {
    it('does nothing when no active mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no active mentorship
      await checkMentorshipCompletion(1);
      expect(mockBeginFn).not.toHaveBeenCalled();
    });

    it('does nothing when bookings below threshold', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, mentor_id: 2, mentee_id: 1 }]);
      mockSqlFn.mockResolvedValueOnce([{ count: 2 }]); // below 3
      await checkMentorshipCompletion(1);
      expect(mockBeginFn).not.toHaveBeenCalled();
    });

    it('completes mentorship and issues credits when threshold reached', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1 }]);
      mockSqlFn.mockResolvedValueOnce([{ count: 3 }]); // hits threshold
      mockTxFn.mockResolvedValue([{ id: 10 }]);
      mockIssueCredit.mockResolvedValue({ id: 100 });

      await checkMentorshipCompletion(1);

      expect(mockBeginFn).toHaveBeenCalled();
      expect(mockTxFn).toHaveBeenCalled(); // update mentorship
      expect(mockIssueCredit).toHaveBeenCalledTimes(2);
      // Mentor credit
      expect(mockIssueCredit).toHaveBeenCalledWith(2, 1500, 'milestone', 'system', expect.stringContaining('Mentor reward'), 10, null, expect.anything());
      // Mentee credit
      expect(mockIssueCredit).toHaveBeenCalledWith(1, 500, 'milestone', 'system', expect.stringContaining('Mentorship completion'), 10, null, expect.anything());
    });

    it('handles errors gracefully', async () => {
      mockSqlFn.mockRejectedValueOnce(new Error('DB error'));
      // Should not throw
      await checkMentorshipCompletion(1);
    });
  });

  // --- adminCompleteMentorship ---
  describe('adminCompleteMentorship', () => {
    it('completes mentorship and issues credits', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'active' }]);
      mockTxFn.mockResolvedValue([{ id: 10 }]);
      mockIssueCredit.mockResolvedValue({ id: 100 });

      const result = await adminCompleteMentorship(10);
      expect(result.success).toBe(true);
      expect(mockIssueCredit).toHaveBeenCalledTimes(2);
    });

    it('rejects non-existent mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await adminCompleteMentorship(999);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mentorship not found');
    });

    it('rejects non-active mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'completed' }]);
      const result = await adminCompleteMentorship(10);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mentorship is not active');
    });
  });

  // --- cancelMentorship ---
  describe('cancelMentorship', () => {
    it('allows mentor to cancel', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'active' }]);
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await cancelMentorship(10, 2);
      expect(result.success).toBe(true);
    });

    it('allows mentee to cancel', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'active' }]);
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await cancelMentorship(10, 1);
      expect(result.success).toBe(true);
    });

    it('rejects unrelated user', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'active' }]);

      const result = await cancelMentorship(10, 99);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Only mentor or mentee can cancel');
    });

    it('rejects non-active mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 10, mentor_id: 2, mentee_id: 1, status: 'completed' }]);

      const result = await cancelMentorship(10, 2);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mentorship is not active');
    });

    it('rejects non-existent mentorship', async () => {
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await cancelMentorship(999, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mentorship not found');
    });
  });
});
