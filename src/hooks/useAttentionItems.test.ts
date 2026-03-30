import { describe, it, expect } from 'vitest';
import { buildAttentionItems } from './attentionItemsUtils';

interface CareTask {
  id: number;
  scheduled_time: string | null;
  completed: boolean;
  description: string;
  pet_name: string;
  category: string;
  booking_id: number;
}

interface Booking {
  id: number;
  status: string;
  sitter_id: number;
  owner_id: number;
  sitter_name?: string;
  owner_name?: string;
  service_type?: string;
  start_time: string;
}

describe('buildAttentionItems', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 60000).toISOString();
  const soon = new Date(now.getTime() + 15 * 60000).toISOString();
  const later = new Date(now.getTime() + 60 * 60000).toISOString();

  const baseTask: CareTask = {
    id: 1, scheduled_time: past, completed: false,
    description: 'Feed dog', pet_name: 'Buddy', category: 'feeding', booking_id: 10,
  };

  it('includes overdue care tasks with highest urgency', () => {
    const items = buildAttentionItems([baseTask], [], 1, false, new Set());
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('care_task_due');
    expect(items[0].urgency).toBe(0);
  });

  it('includes upcoming care tasks within 30 min', () => {
    const task = { ...baseTask, id: 2, scheduled_time: soon };
    const items = buildAttentionItems([task], [], 1, false, new Set());
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('care_task_upcoming');
  });

  it('excludes care tasks with null scheduled_time', () => {
    const task = { ...baseTask, scheduled_time: null };
    const items = buildAttentionItems([task], [], 1, false, new Set());
    expect(items).toHaveLength(0);
  });

  it('excludes care tasks more than 30 min away', () => {
    const task = { ...baseTask, id: 3, scheduled_time: later };
    const items = buildAttentionItems([task], [], 1, false, new Set());
    expect(items).toHaveLength(0);
  });

  it('excludes completed care tasks', () => {
    const task = { ...baseTask, completed: true };
    const items = buildAttentionItems([task], [], 1, false, new Set());
    expect(items).toHaveLength(0);
  });

  it('includes pending bookings for sitter', () => {
    const booking: Booking = { id: 10, status: 'pending', sitter_id: 2, owner_id: 1, start_time: soon };
    const items = buildAttentionItems([], [booking], 2, true, new Set());
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('pending_booking');
  });

  it('includes pending bookings for owner', () => {
    const booking: Booking = { id: 10, status: 'pending', sitter_id: 2, owner_id: 1, start_time: soon };
    const items = buildAttentionItems([], [booking], 1, false, new Set());
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('pending_booking');
  });

  it('includes pending reviews for owner only', () => {
    const booking: Booking = { id: 10, status: 'completed', sitter_id: 2, owner_id: 1, sitter_name: 'Bob', start_time: past };
    const items = buildAttentionItems([], [booking], 1, false, new Set());
    expect(items.find(i => i.type === 'pending_review')).toBeDefined();

    const sitterItems = buildAttentionItems([], [booking], 2, true, new Set());
    expect(sitterItems.find(i => i.type === 'pending_review')).toBeUndefined();
  });

  it('excludes already-reviewed bookings', () => {
    const booking: Booking = { id: 10, status: 'completed', sitter_id: 2, owner_id: 1, start_time: past };
    const items = buildAttentionItems([], [booking], 1, false, new Set([10]));
    expect(items).toHaveLength(0);
  });

  it('sorts by urgency', () => {
    const booking: Booking = { id: 10, status: 'pending', sitter_id: 2, owner_id: 1, start_time: soon };
    const items = buildAttentionItems([baseTask], [booking], 1, false, new Set());
    expect(items[0].type).toBe('care_task_due');
    expect(items[1].type).toBe('pending_booking');
  });

  it('returns empty array when nothing needs attention', () => {
    expect(buildAttentionItems([], [], 1, false, new Set())).toEqual([]);
  });
});
