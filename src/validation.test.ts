import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  petSchema,
  serviceSchema,
  createBookingSchema,
  updateBookingStatusSchema,
  createReviewSchema,
  createSitterPhotoSchema,
  updateSitterPhotoSchema,
  cancellationPolicySchema,
  validate,
} from './validation.ts';

// --- Schema Unit Tests ---

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const result = signupSchema.safeParse({
      email: ' Test@Example.COM ',
      password: 'password123',
      name: '  Alice  ',
      role: 'owner',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.name).toBe('Alice');
      expect(result.data.role).toBe('owner');
    }
  });

  it('defaults role to owner', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Alice',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('owner');
    }
  });

  it('rejects missing email', () => {
    const result = signupSchema.safeParse({
      password: 'password123',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password exceeding 72 chars', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'a'.repeat(73),
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Alice',
      is_admin: true,
      password_hash: 'fake',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('is_admin');
      expect(result.data).not.toHaveProperty('password_hash');
    }
  });

  it('rejects invalid role', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Alice',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'Test@Example.COM',
      password: 'any-password',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepts valid profile update', () => {
    const result = updateProfileSchema.safeParse({
      name: '  Bob  ',
      bio: 'I love dogs',
      avatar_url: 'https://example.com/pic.jpg',
      role: 'sitter',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Bob');
    }
  });

  it('accepts nullable/optional fields', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Bob',
      bio: null,
      avatar_url: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = updateProfileSchema.safeParse({
      name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('petSchema', () => {
  it('accepts valid pet data', () => {
    const result = petSchema.safeParse({
      name: '  Buddy  ',
      breed: 'Golden Retriever',
      age: 3,
      weight: 65.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Buddy');
    }
  });

  it('rejects age over 50', () => {
    const result = petSchema.safeParse({ name: 'Buddy', age: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects weight over 500', () => {
    const result = petSchema.safeParse({ name: 'Buddy', weight: 501 });
    expect(result.success).toBe(false);
  });

  it('rejects negative age', () => {
    const result = petSchema.safeParse({ name: 'Buddy', age: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts null optional fields', () => {
    const result = petSchema.safeParse({
      name: 'Buddy',
      breed: null,
      age: null,
      weight: null,
      medical_history: null,
      photo_url: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('createBookingSchema', () => {
  it('accepts valid booking data', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1],
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects end_time before start_time', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1],
      start_time: '2026-03-01T11:00:00Z',
      end_time: '2026-03-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects equal start and end times', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date strings', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1],
      start_time: 'not-a-date',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields like total_price', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1],
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
      total_price: 999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('total_price');
    }
  });

  it('accepts multiple pet_ids', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1, 2, 3],
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty pet_ids', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [],
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 10 pet_ids', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing pet_ids', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      start_time: '2026-03-01T10:00:00Z',
      end_time: '2026-03-01T11:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBookingStatusSchema', () => {
  it('accepts confirmed', () => {
    const result = updateBookingStatusSchema.safeParse({ status: 'confirmed' });
    expect(result.success).toBe(true);
  });

  it('accepts cancelled', () => {
    const result = updateBookingStatusSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateBookingStatusSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });
});

describe('createReviewSchema', () => {
  it('accepts valid review data', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      comment: 'Great sitter!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects rating below 1', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects rating above 5', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer rating', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 3.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('serviceSchema', () => {
  it('accepts valid service data', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, description: 'A nice walk' });
    expect(result.success).toBe(true);
  });

  it('accepts service without description', () => {
    const result = serviceSchema.safeParse({ type: 'sitting', price: 50 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = serviceSchema.safeParse({ type: 'bathing', price: 25 });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects price of 0 for non-meet_greet services', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects price above 9999', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 10000 });
    expect(result.success).toBe(false);
  });

  it('accepts all valid service types', () => {
    for (const type of ['walking', 'sitting', 'drop-in', 'grooming']) {
      expect(serviceSchema.safeParse({ type, price: 30 }).success).toBe(true);
    }
  });

  it('accepts meet_greet with price 0', () => {
    const result = serviceSchema.safeParse({ type: 'meet_greet', price: 0, description: 'Quick intro meeting' });
    expect(result.success).toBe(true);
  });

  it('rejects meet_greet with non-zero price', () => {
    const result = serviceSchema.safeParse({ type: 'meet_greet', price: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects description over 1000 characters', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, description: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts additional_pet_price', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, additional_pet_price: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additional_pet_price).toBe(5);
    }
  });

  it('defaults additional_pet_price to 0', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additional_pet_price).toBe(0);
    }
  });

  it('rejects negative additional_pet_price', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, additional_pet_price: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects additional_pet_price over 500', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, additional_pet_price: 501 });
    expect(result.success).toBe(false);
  });
});

// --- Sitter Photo Schema Tests ---

describe('createSitterPhotoSchema', () => {
  it('accepts valid photo data', () => {
    const result = createSitterPhotoSchema.safeParse({
      photo_url: 'https://example.com/photo.jpg',
      caption: 'My backyard',
      sort_order: 0,
    });
    expect(result.success).toBe(true);
  });

  it('defaults caption to empty string', () => {
    const result = createSitterPhotoSchema.safeParse({ photo_url: 'https://example.com/photo.jpg' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBe('');
    }
  });

  it('rejects invalid URL', () => {
    const result = createSitterPhotoSchema.safeParse({ photo_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP URL (requires HTTPS)', () => {
    const result = createSitterPhotoSchema.safeParse({ photo_url: 'http://example.com/photo.jpg' });
    expect(result.success).toBe(false);
  });

  it('rejects caption over 200 characters', () => {
    const result = createSitterPhotoSchema.safeParse({
      photo_url: 'https://example.com/photo.jpg',
      caption: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSitterPhotoSchema', () => {
  it('accepts partial update', () => {
    const result = updateSitterPhotoSchema.safeParse({ caption: 'New caption' });
    expect(result.success).toBe(true);
  });

  it('accepts sort_order update', () => {
    const result = updateSitterPhotoSchema.safeParse({ sort_order: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects negative sort_order', () => {
    const result = updateSitterPhotoSchema.safeParse({ sort_order: -1 });
    expect(result.success).toBe(false);
  });
});

// --- Cancellation Policy Schema Tests ---

describe('cancellationPolicySchema', () => {
  it('accepts flexible policy', () => {
    expect(cancellationPolicySchema.safeParse({ cancellation_policy: 'flexible' }).success).toBe(true);
  });

  it('accepts moderate policy', () => {
    expect(cancellationPolicySchema.safeParse({ cancellation_policy: 'moderate' }).success).toBe(true);
  });

  it('accepts strict policy', () => {
    expect(cancellationPolicySchema.safeParse({ cancellation_policy: 'strict' }).success).toBe(true);
  });

  it('rejects invalid policy', () => {
    expect(cancellationPolicySchema.safeParse({ cancellation_policy: 'custom' }).success).toBe(false);
  });

  it('rejects missing policy', () => {
    expect(cancellationPolicySchema.safeParse({}).success).toBe(false);
  });
});

// --- validate middleware ---

describe('validate middleware', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (data: any) => { res.body = data; return res; };
    return res;
  };

  it('calls next() on valid input', () => {
    const middleware = validate(loginSchema);
    const req: any = { body: { email: 'test@example.com', password: 'pass' } };
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.body.email).toBe('test@example.com');
  });

  it('replaces req.body with parsed data (transforms applied)', () => {
    const middleware = validate(signupSchema);
    const req: any = {
      body: { email: '  TEST@EXAMPLE.COM  ', password: 'password123', name: '  Alice  ' },
    };
    const res = mockRes();
    middleware(req, res, () => {});
    expect(req.body.email).toBe('test@example.com');
    expect(req.body.name).toBe('Alice');
    expect(req.body.role).toBe('owner');
  });

  it('returns 400 with error on invalid input', () => {
    const middleware = validate(loginSchema);
    const req: any = { body: { email: 'not-email', password: '' } };
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.errors).toBeInstanceOf(Array);
  });
});
