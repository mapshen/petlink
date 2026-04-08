import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

const mockCreateNotification = vi.fn().mockResolvedValue(null);
vi.mock('./notifications.ts', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

import { revealEmergencyContact } from './emergency-contact.ts';

describe('revealEmergencyContact', () => {
  beforeEach(() => vi.clearAllMocks());

  const makeBooking = (overrides = {}) => ({
    id: 1,
    owner_id: 10,
    sitter_id: 20,
    status: 'confirmed',
    ...overrides,
  });

  const makeUser = (overrides = {}) => ({
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '5551234567',
    emergency_contact_relationship: 'spouse',
    ...overrides,
  });

  it('returns contact for owner requesting sitter emergency contact', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]); // requester name

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({
      success: true,
      contact: {
        name: 'Jane Doe',
        phone: '5551234567',
        relationship: 'spouse',
      },
    });
  });

  it('returns contact for sitter requesting owner emergency contact', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser({ emergency_contact_name: 'John Smith', emergency_contact_phone: '5559876543', emergency_contact_relationship: 'parent' })]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([{ name: 'Bob Sitter' }]); // requester name

    const result = await revealEmergencyContact(1, 20);

    expect(result).toEqual({
      success: true,
      contact: {
        name: 'John Smith',
        phone: '5559876543',
        relationship: 'parent',
      },
    });
  });

  it('returns not_found for non-existent booking', async () => {
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await revealEmergencyContact(999, 10);

    expect(result).toEqual({ error: 'not_found' });
  });

  it('returns forbidden for user not on booking', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);

    const result = await revealEmergencyContact(1, 999);

    expect(result).toEqual({ error: 'forbidden' });
  });

  it('returns booking_not_active for pending booking', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking({ status: 'pending' })]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({ error: 'booking_not_active' });
  });

  it('returns booking_not_active for completed booking', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking({ status: 'completed' })]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({ error: 'booking_not_active' });
  });

  it('returns booking_not_active for cancelled booking', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking({ status: 'cancelled' })]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({ error: 'booking_not_active' });
  });

  it('allows in_progress bookings', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking({ status: 'in_progress' })]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({
      success: true,
      contact: {
        name: 'Jane Doe',
        phone: '5551234567',
        relationship: 'spouse',
      },
    });
  });

  it('returns no_emergency_contact when other party has none', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser({
      emergency_contact_name: null,
      emergency_contact_phone: null,
      emergency_contact_relationship: null,
    })]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({ error: 'no_emergency_contact' });
  });

  it('logs access to audit table', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    await revealEmergencyContact(1, 10);

    // Third SQL call is the INSERT into emergency_contact_access_log
    expect(mockSqlFn).toHaveBeenCalledTimes(4);
  });

  it('sends notification to contact owner', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    await revealEmergencyContact(1, 10);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      20, // sitter (contact owner)
      'emergency_contact_viewed',
      'Emergency contact viewed',
      'Alice Owner viewed your emergency contact for booking #1',
    );
  });

  it('multiple reveals create multiple log entries', async () => {
    // First reveal
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    await revealEmergencyContact(1, 10);

    // Second reveal
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    await revealEmergencyContact(1, 10);

    // 8 total SQL calls (4 per reveal)
    expect(mockSqlFn).toHaveBeenCalledTimes(8);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it('handles missing requester name gracefully in notification', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser()]);
    mockSqlFn.mockResolvedValueOnce([]); // INSERT log
    mockSqlFn.mockResolvedValueOnce([]); // no requester found (edge case)

    await revealEmergencyContact(1, 10);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      20,
      'emergency_contact_viewed',
      'Emergency contact viewed',
      'Someone viewed your emergency contact for booking #1',
    );
  });

  it('returns contact with only name (no phone)', async () => {
    mockSqlFn.mockResolvedValueOnce([makeBooking()]);
    mockSqlFn.mockResolvedValueOnce([makeUser({
      emergency_contact_name: 'Jane Doe',
      emergency_contact_phone: null,
      emergency_contact_relationship: null,
    })]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Alice Owner' }]);

    const result = await revealEmergencyContact(1, 10);

    expect(result).toEqual({
      success: true,
      contact: {
        name: 'Jane Doe',
        phone: null,
        relationship: null,
      },
    });
  });
});
