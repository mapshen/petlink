import { describe, it, expect } from 'vitest';

/**
 * Tests for onboarding reminder eligibility and scheduling logic.
 * Uses pure function tests (no DB) since the scheduler delegates
 * to testable utility functions.
 */

const REMINDER_SCHEDULE = [1, 2, 4, 7]; // Days after onboarding_started_at

interface SitterOnboardingState {
  onboarding_started_at: string | null;
  onboarding_reminder_count: number;
  onboarding_reminder_sent_at: string | null;
  bio: string | null;
  has_services: boolean;
  email_enabled: boolean;
}

/** Determine the next reminder day in the schedule for this sitter */
function getNextReminderDay(reminderCount: number): number | null {
  if (reminderCount >= REMINDER_SCHEDULE.length) return null;
  return REMINDER_SCHEDULE[reminderCount];
}

/** Check if a sitter is eligible to receive an onboarding reminder right now */
function isEligibleForReminder(sitter: SitterOnboardingState, now: Date): boolean {
  // Must have started onboarding
  if (!sitter.onboarding_started_at) return false;

  // Must have email enabled
  if (!sitter.email_enabled) return false;

  // Must not have completed required steps (Profile=bio + Services)
  if (sitter.bio && sitter.has_services) return false;

  // Must have remaining reminders
  const nextDay = getNextReminderDay(sitter.onboarding_reminder_count);
  if (nextDay === null) return false;

  // Check if enough days have passed since onboarding started
  const startedAt = new Date(sitter.onboarding_started_at);
  const daysSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart < nextDay) return false;

  return true;
}

/** Compute which steps are complete for the email content */
function computeStepStatus(sitter: { bio: string | null; has_services: boolean; avatar_url: string | null; has_verification: boolean }) {
  return {
    profile: Boolean(sitter.bio),
    services: sitter.has_services,
    photos: Boolean(sitter.avatar_url),
    verification: sitter.has_verification,
  };
}

const baseSitter: SitterOnboardingState = {
  onboarding_started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  onboarding_reminder_count: 0,
  onboarding_reminder_sent_at: null,
  bio: null,
  has_services: false,
  email_enabled: true,
};

describe('getNextReminderDay', () => {
  it('returns day 1 for count=0', () => {
    expect(getNextReminderDay(0)).toBe(1);
  });

  it('returns day 2 for count=1', () => {
    expect(getNextReminderDay(1)).toBe(2);
  });

  it('returns day 4 for count=2', () => {
    expect(getNextReminderDay(2)).toBe(4);
  });

  it('returns day 7 for count=3', () => {
    expect(getNextReminderDay(3)).toBe(7);
  });

  it('returns null for count=4 (all sent)', () => {
    expect(getNextReminderDay(4)).toBeNull();
  });

  it('returns null for count > 4', () => {
    expect(getNextReminderDay(10)).toBeNull();
  });
});

describe('isEligibleForReminder', () => {
  const now = new Date();

  it('eligible: started 2 days ago, 0 reminders sent', () => {
    expect(isEligibleForReminder(baseSitter, now)).toBe(true);
  });

  it('not eligible: onboarding not started', () => {
    expect(isEligibleForReminder({ ...baseSitter, onboarding_started_at: null }, now)).toBe(false);
  });

  it('not eligible: email disabled', () => {
    expect(isEligibleForReminder({ ...baseSitter, email_enabled: false }, now)).toBe(false);
  });

  it('not eligible: required steps complete (bio + services)', () => {
    expect(isEligibleForReminder({ ...baseSitter, bio: 'I love pets', has_services: true }, now)).toBe(false);
  });

  it('eligible: has bio but no services', () => {
    expect(isEligibleForReminder({ ...baseSitter, bio: 'I love pets' }, now)).toBe(true);
  });

  it('eligible: has services but no bio', () => {
    expect(isEligibleForReminder({ ...baseSitter, has_services: true }, now)).toBe(true);
  });

  it('not eligible: all 4 reminders already sent', () => {
    expect(isEligibleForReminder({ ...baseSitter, onboarding_reminder_count: 4 }, now)).toBe(false);
  });

  it('not eligible: started today, first reminder is day 1', () => {
    const startedToday = { ...baseSitter, onboarding_started_at: new Date().toISOString() };
    // Less than 1 day has passed
    expect(isEligibleForReminder(startedToday, now)).toBe(false);
  });

  it('eligible: started 1 day ago, count=0 (day 1 trigger)', () => {
    const started1DayAgo = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 1.1 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(isEligibleForReminder(started1DayAgo, now)).toBe(true);
  });

  it('not eligible: 1 reminder sent, only 1.5 days passed (need day 2)', () => {
    const sitter = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
      onboarding_reminder_count: 1,
    };
    expect(isEligibleForReminder(sitter, now)).toBe(false);
  });

  it('eligible: 1 reminder sent, 2.5 days passed (day 2 trigger)', () => {
    const sitter = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(),
      onboarding_reminder_count: 1,
    };
    expect(isEligibleForReminder(sitter, now)).toBe(true);
  });

  it('eligible: 2 reminders sent, 5 days passed (day 4 trigger)', () => {
    const sitter = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      onboarding_reminder_count: 2,
    };
    expect(isEligibleForReminder(sitter, now)).toBe(true);
  });

  it('not eligible: 2 reminders sent, only 3 days passed (need day 4)', () => {
    const sitter = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      onboarding_reminder_count: 2,
    };
    expect(isEligibleForReminder(sitter, now)).toBe(false);
  });

  it('eligible: 3 reminders sent, 8 days passed (day 7 trigger)', () => {
    const sitter = {
      ...baseSitter,
      onboarding_started_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      onboarding_reminder_count: 3,
    };
    expect(isEligibleForReminder(sitter, now)).toBe(true);
  });
});

describe('computeStepStatus', () => {
  it('all incomplete', () => {
    const status = computeStepStatus({ bio: null, has_services: false, avatar_url: null, has_verification: false });
    expect(status).toEqual({ profile: false, services: false, photos: false, verification: false });
  });

  it('all complete', () => {
    const status = computeStepStatus({ bio: 'Hello', has_services: true, avatar_url: 'url', has_verification: true });
    expect(status).toEqual({ profile: true, services: true, photos: true, verification: true });
  });

  it('partial completion', () => {
    const status = computeStepStatus({ bio: 'Hello', has_services: false, avatar_url: 'url', has_verification: false });
    expect(status).toEqual({ profile: true, services: false, photos: true, verification: false });
  });
});
