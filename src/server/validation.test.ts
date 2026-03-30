import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  petSchema,
  petVaccinationSchema,
  serviceSchema,
  createBookingSchema,
  updateBookingStatusSchema,
  createReviewSchema,
  reviewResponseSchema,
  createSitterPhotoSchema,
  updateSitterPhotoSchema,
  cancellationPolicySchema,
  oauthSchema,
  setPasswordSchema,
  changePasswordSchema,
  validate,
} from './validation.ts';

// --- Schema Unit Tests ---

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const result = signupSchema.safeParse({
      email: ' Test@Example.COM ',
      password: 'password123',
      name: '  Alice  ',
      age_confirmed: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.name).toBe('Alice');
    }
  });

  it('does not include role in parsed data', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Alice',
      age_confirmed: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('role');
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
      age_confirmed: true,
      is_admin: true,
      password_hash: 'fake',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('is_admin');
      expect(result.data).not.toHaveProperty('password_hash');
    }
  });

  it('ignores role field in signup (roles assigned server-side)', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Alice',
      age_confirmed: true,
      role: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('role');
    }
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

  it('accepts sitter profile fields', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Bob',
      accepted_species: ['dog', 'cat'],
      years_experience: 5,
      home_type: 'house',
      has_yard: true,
      has_fenced_yard: true,
      has_own_pets: false,
      skills: ['pet_first_aid', 'dog_training'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid species in accepted_species', () => {
    expect(updateProfileSchema.safeParse({ name: 'Bob', accepted_species: ['fish'] }).success).toBe(false);
  });

  it('rejects invalid home_type', () => {
    expect(updateProfileSchema.safeParse({ name: 'Bob', home_type: 'tent' }).success).toBe(false);
  });

  it('rejects invalid skills', () => {
    expect(updateProfileSchema.safeParse({ name: 'Bob', skills: ['sword_fighting'] }).success).toBe(false);
  });

  it('rejects years_experience over 50', () => {
    expect(updateProfileSchema.safeParse({ name: 'Bob', years_experience: 51 }).success).toBe(false);
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

  it('defaults species to dog', () => {
    const result = petSchema.safeParse({ name: 'Buddy' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.species).toBe('dog');
    }
  });

  it('accepts all valid species', () => {
    for (const species of ['dog', 'cat', 'bird', 'reptile', 'small_animal']) {
      expect(petSchema.safeParse({ name: 'Pet', species }).success).toBe(true);
    }
  });

  it('rejects invalid species', () => {
    expect(petSchema.safeParse({ name: 'Pet', species: 'fish' }).success).toBe(false);
  });

  it('accepts gender values', () => {
    expect(petSchema.safeParse({ name: 'Pet', gender: 'male' }).success).toBe(true);
    expect(petSchema.safeParse({ name: 'Pet', gender: 'female' }).success).toBe(true);
    expect(petSchema.safeParse({ name: 'Pet', gender: 'other' }).success).toBe(false);
  });

  it('accepts energy level values', () => {
    for (const level of ['low', 'medium', 'high']) {
      expect(petSchema.safeParse({ name: 'Pet', energy_level: level }).success).toBe(true);
    }
    expect(petSchema.safeParse({ name: 'Pet', energy_level: 'extreme' }).success).toBe(false);
  });

  it('accepts boolean fields', () => {
    const result = petSchema.safeParse({
      name: 'Buddy',
      spayed_neutered: true,
      house_trained: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spayed_neutered).toBe(true);
      expect(result.data.house_trained).toBe(false);
    }
  });

  it('accepts temperament tags', () => {
    const result = petSchema.safeParse({
      name: 'Buddy',
      temperament: ['friendly', 'playful', 'good_with_kids'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperament).toEqual(['friendly', 'playful', 'good_with_kids']);
    }
  });

  it('rejects invalid temperament tags', () => {
    expect(petSchema.safeParse({ name: 'Pet', temperament: ['aggressive'] }).success).toBe(false);
  });

  it('rejects more than 10 temperament tags', () => {
    const tags = ['friendly', 'shy', 'anxious', 'reactive', 'good_with_kids', 'good_with_dogs', 'good_with_cats', 'playful', 'calm', 'independent', 'friendly'];
    expect(petSchema.safeParse({ name: 'Pet', temperament: tags }).success).toBe(false);
  });

  it('defaults temperament to empty array', () => {
    const result = petSchema.safeParse({ name: 'Buddy' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperament).toEqual([]);
    }
  });

  it('accepts vet and emergency contact info', () => {
    const result = petSchema.safeParse({
      name: 'Buddy',
      vet_name: 'Dr. Smith',
      vet_phone: '555-0100',
      emergency_contact_name: 'Jane Doe',
      emergency_contact_phone: '555-0200',
      microchip_number: 'ABC123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects microchip number over 50 chars', () => {
    expect(petSchema.safeParse({ name: 'Pet', microchip_number: 'a'.repeat(51) }).success).toBe(false);
  });

  it('accepts special needs text', () => {
    const result = petSchema.safeParse({ name: 'Buddy', special_needs: 'Needs insulin injection twice daily' });
    expect(result.success).toBe(true);
  });

  it('rejects special needs over 2000 chars', () => {
    expect(petSchema.safeParse({ name: 'Pet', special_needs: 'a'.repeat(2001) }).success).toBe(false);
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
      gender: null,
      spayed_neutered: null,
      energy_level: null,
      house_trained: null,
      special_needs: null,
      microchip_number: null,
      vet_name: null,
      vet_phone: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('petVaccinationSchema', () => {
  it('accepts valid vaccination data', () => {
    const result = petVaccinationSchema.safeParse({
      vaccine_name: 'Rabies',
      administered_date: '2025-01-15',
      expires_at: '2026-01-15',
    });
    expect(result.success).toBe(true);
  });

  it('requires vaccine name', () => {
    expect(petVaccinationSchema.safeParse({}).success).toBe(false);
    expect(petVaccinationSchema.safeParse({ vaccine_name: '' }).success).toBe(false);
  });

  it('trims vaccine name', () => {
    const result = petVaccinationSchema.safeParse({ vaccine_name: '  Rabies  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vaccine_name).toBe('Rabies');
    }
  });

  it('rejects vaccine name over 100 chars', () => {
    expect(petVaccinationSchema.safeParse({ vaccine_name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts optional dates', () => {
    const result = petVaccinationSchema.safeParse({ vaccine_name: 'DHPP' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date strings', () => {
    expect(petVaccinationSchema.safeParse({ vaccine_name: 'Rabies', administered_date: 'not-a-date' }).success).toBe(false);
  });

  it('accepts document URL', () => {
    const result = petVaccinationSchema.safeParse({
      vaccine_name: 'Bordetella',
      document_url: 'https://example.com/cert.pdf',
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

  it('rejects duplicate pet_ids', () => {
    const result = createBookingSchema.safeParse({
      sitter_id: 1,
      service_id: 2,
      pet_ids: [1, 1, 2],
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

  it('accepts review with sub-ratings', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      pet_care_rating: 5,
      communication_rating: 4,
      reliability_rating: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts review without sub-ratings (all optional)', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects sub-rating outside 1-5 range', () => {
    expect(createReviewSchema.safeParse({ booking_id: 1, rating: 5, pet_care_rating: 0 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ booking_id: 1, rating: 5, communication_rating: 6 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ booking_id: 1, rating: 5, reliability_rating: -1 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ booking_id: 1, rating: 5, pet_accuracy_rating: 10 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ booking_id: 1, rating: 5, preparedness_rating: 0 }).success).toBe(false);
  });

  it('accepts null sub-ratings', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 4,
      pet_care_rating: null,
      communication_rating: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('reviewResponseSchema', () => {
  it('accepts valid response', () => {
    const result = reviewResponseSchema.safeParse({ response_text: 'Thank you!' });
    expect(result.success).toBe(true);
  });

  it('rejects empty response', () => {
    const result = reviewResponseSchema.safeParse({ response_text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only response', () => {
    const result = reviewResponseSchema.safeParse({ response_text: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects response over 1000 characters', () => {
    const result = reviewResponseSchema.safeParse({ response_text: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts response at exactly 1000 characters', () => {
    const result = reviewResponseSchema.safeParse({ response_text: 'x'.repeat(1000) });
    expect(result.success).toBe(true);
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

  it('accepts max_pets', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25, max_pets: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_pets).toBe(5);
    }
  });

  it('defaults max_pets to 1', () => {
    const result = serviceSchema.safeParse({ type: 'walking', price: 25 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_pets).toBe(1);
    }
  });

  it('rejects max_pets of 0', () => {
    expect(serviceSchema.safeParse({ type: 'walking', price: 25, max_pets: 0 }).success).toBe(false);
  });

  it('rejects max_pets over 20', () => {
    expect(serviceSchema.safeParse({ type: 'walking', price: 25, max_pets: 21 }).success).toBe(false);
  });

  it('accepts service_details object', () => {
    const result = serviceSchema.safeParse({
      type: 'walking',
      price: 25,
      service_details: { duration_minutes: 30, solo_walk: true },
    });
    expect(result.success).toBe(true);
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

// --- OAuth Schema Tests ---

describe('oauthSchema', () => {
  it('accepts valid provider and token', () => {
    for (const provider of ['google', 'apple', 'facebook']) {
      const result = oauthSchema.safeParse({ provider, token: 'some-id-token' });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid provider', () => {
    const result = oauthSchema.safeParse({ provider: 'twitter', token: 'some-token' });
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = oauthSchema.safeParse({ provider: 'google', token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing token', () => {
    const result = oauthSchema.safeParse({ provider: 'google' });
    expect(result.success).toBe(false);
  });

  it('rejects missing provider', () => {
    const result = oauthSchema.safeParse({ token: 'some-token' });
    expect(result.success).toBe(false);
  });
});

describe('setPasswordSchema', () => {
  it('accepts valid password', () => {
    const result = setPasswordSchema.safeParse({ password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = setPasswordSchema.safeParse({ password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects password over 72 chars', () => {
    const result = setPasswordSchema.safeParse({ password: 'a'.repeat(73) });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('accepts valid current and new password', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'oldpass123', newPassword: 'newpass123' });
    expect(result.success).toBe(true);
  });

  it('rejects missing currentPassword', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'newpass123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty currentPassword', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'newpass123' });
    expect(result.success).toBe(false);
  });

  it('rejects short newPassword', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'oldpass123', newPassword: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects newPassword over 72 chars', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'oldpass123', newPassword: 'a'.repeat(73) });
    expect(result.success).toBe(false);
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
      body: { email: '  TEST@EXAMPLE.COM  ', password: 'password123', name: '  Alice  ', age_confirmed: true },
    };
    const res = mockRes();
    middleware(req, res, () => {});
    expect(req.body.email).toBe('test@example.com');
    expect(req.body.name).toBe('Alice');
    expect(req.body).not.toHaveProperty('role');
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
