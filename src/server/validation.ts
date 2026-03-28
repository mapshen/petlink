import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// --- Validation Middleware ---
export function validate<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => i.message);
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

// --- Shared refinements ---
const emailSchema = z.string().trim().toLowerCase().email('A valid email address is required');
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must not exceed 72 characters');
const roleSchema = z.enum(['owner', 'sitter', 'both']).optional().default('owner');
const nameSchema = (msg: string) => z.string().transform((v) => v.trim()).pipe(z.string().min(1, msg));

// --- Auth Schemas ---
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema('Name is required'),
  role: roleSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// --- User Schemas ---
const homeTypes = ['house', 'apartment', 'condo', 'other'] as const;
const sitterSkills = ['pet_first_aid', 'dog_training', 'medication_admin', 'puppy_care', 'senior_pet_care', 'behavioral_issues', 'grooming_basics'] as const;

export const updateProfileSchema = z.object({
  name: nameSchema('Name is required'),
  bio: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable().or(z.literal('')),
  role: z.enum(['owner', 'sitter', 'both']).optional(),
  accepted_species: z.array(z.enum(['dog', 'cat', 'bird', 'reptile', 'small_animal'])).optional(),
  years_experience: z.number().int().min(0).max(50).optional().nullable(),
  home_type: z.enum(homeTypes).optional().nullable(),
  has_yard: z.boolean().optional().nullable(),
  has_fenced_yard: z.boolean().optional().nullable(),
  has_own_pets: z.boolean().optional().nullable(),
  own_pets_description: z.string().max(500).optional().nullable(),
  skills: z.array(z.enum(sitterSkills)).max(10).optional(),
  service_radius_miles: z.number().int().min(1).max(100).optional().nullable(),
});

// --- Pet Schemas ---
const petSpecies = ['dog', 'cat', 'bird', 'reptile', 'small_animal'] as const;
const petGender = ['male', 'female'] as const;
const energyLevel = ['low', 'medium', 'high'] as const;
const temperamentTags = ['friendly', 'shy', 'anxious', 'reactive', 'good_with_kids', 'good_with_dogs', 'good_with_cats', 'playful', 'calm', 'independent'] as const;

export const petSchema = z.object({
  name: nameSchema('Pet name is required'),
  species: z.enum(petSpecies).optional().default('dog'),
  breed: z.string().optional().nullable(),
  age: z.number().int().min(0).max(50).optional().nullable(),
  weight: z.number().min(0).max(500).optional().nullable(),
  gender: z.enum(petGender).optional().nullable(),
  spayed_neutered: z.boolean().optional().nullable(),
  energy_level: z.enum(energyLevel).optional().nullable(),
  house_trained: z.boolean().optional().nullable(),
  temperament: z.array(z.enum(temperamentTags)).max(10, 'Maximum 10 temperament tags').optional().default([]),
  special_needs: z.string().max(2000, 'Special needs must be under 2000 characters').optional().nullable(),
  microchip_number: z.string().max(50, 'Microchip number must be under 50 characters').optional().nullable(),
  vet_name: z.string().max(200).optional().nullable(),
  vet_phone: z.string().max(20).optional().nullable(),
  emergency_contact_name: z.string().max(200).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  medical_history: z.string().optional().nullable(),
  photo_url: z.string().url().optional().nullable().or(z.literal('')),
});

export const petVaccinationSchema = z.object({
  vaccine_name: z.string().trim().min(1, 'Vaccine name is required').max(100, 'Vaccine name must be under 100 characters'),
  administered_date: z.string().refine((v) => !v || !isNaN(new Date(v).getTime()), 'Must be a valid date').optional().nullable(),
  expires_at: z.string().refine((v) => !v || !isNaN(new Date(v).getTime()), 'Must be a valid date').optional().nullable(),
  document_url: z.string().url().optional().nullable().or(z.literal('')),
});

// --- Care Instruction Schemas ---
const careCategory = ['feeding', 'medication', 'exercise', 'grooming', 'behavioral', 'other'] as const;

export const careInstructionSchema = z.object({
  id: z.string().min(1),
  category: z.enum(careCategory),
  description: z.string().trim().min(1, 'Description is required').max(500),
  time: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateCareInstructionsSchema = z.object({
  care_instructions: z.array(careInstructionSchema).max(50, 'Maximum 50 care instructions per pet'),
});

// --- Booking Schemas ---
export const createBookingSchema = z.object({
  sitter_id: z.number().int().positive('Invalid sitter ID'),
  service_id: z.number().int().positive('Invalid service ID'),
  pet_ids: z.array(z.number().int().positive('Invalid pet ID')).min(1, 'At least one pet is required').max(10, 'Maximum 10 pets per booking').refine((ids) => new Set(ids).size === ids.length, 'Duplicate pet IDs are not allowed'),
  start_time: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'start_time must be a valid date'),
  end_time: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'end_time must be a valid date'),
}).refine(
  (data) => new Date(data.end_time) > new Date(data.start_time),
  { message: 'end_time must be after start_time', path: ['end_time'] }
);

export const updateBookingStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled'], { message: 'Status must be "confirmed" or "cancelled"' }),
});

// --- Service Schemas ---
export const serviceSchema = z.object({
  type: z.enum(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet'], { message: 'Type must be walking, sitting, drop-in, grooming, or meet_greet' }),
  price: z.number().min(0, 'Price cannot be negative').max(9999, 'Price must be under $10,000'),
  description: z.string().max(1000, 'Description must be under 1000 characters').optional().nullable(),
  additional_pet_price: z.number().min(0, 'Additional pet price cannot be negative').max(500, 'Additional pet price must be under $500').optional().default(0),
  max_pets: z.number().int().min(1, 'Must accept at least 1 pet').max(20, 'Maximum 20 pets').optional().default(1),
  service_details: z.record(z.string(), z.unknown()).refine(
    (obj) => JSON.stringify(obj).length <= 5000,
    'Service details must be under 5KB'
  ).optional().nullable(),
}).refine(
  (data) => data.type === 'meet_greet' || data.price >= 1,
  { message: 'Price must be at least $1', path: ['price'] }
).refine(
  (data) => data.type !== 'meet_greet' || data.price === 0,
  { message: 'Meet & greet must be free (price = 0)', path: ['price'] }
);

// --- Sitter Photo Schemas ---
export const createSitterPhotoSchema = z.object({
  photo_url: z.string().url('A valid photo URL is required').refine((url) => url.startsWith('https://'), 'Photo URL must use HTTPS'),
  caption: z.string().max(200, 'Caption must be under 200 characters').optional().default(''),
  sort_order: z.number().int().min(0).max(9).optional().default(0),
});

export const updateSitterPhotoSchema = z.object({
  caption: z.string().max(200, 'Caption must be under 200 characters').optional(),
  sort_order: z.number().int().min(0).max(9).optional(),
});

// --- Review Schemas ---
export const createReviewSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  comment: z.string().optional().nullable(),
});

// --- Quick-Tap Care Event Schemas ---
export const quickTapEventSchema = z.object({
  event_type: z.enum(['start', 'pee', 'poop', 'photo', 'end', 'fed', 'water', 'medication', 'nap_start', 'nap_end', 'play', 'video']),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  photo_url: z.string().url().refine((url) => url.startsWith('https://'), 'Photo URL must use HTTPS').optional().nullable(),
  video_url: z.string().url().refine((url) => url.startsWith('https://'), 'Video URL must use HTTPS').optional().nullable(),
  pet_id: z.number().int().positive().optional().nullable(),
});

// --- Recurring Booking Schemas ---
export const createRecurringBookingSchema = z.object({
  sitter_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  pet_ids: z.array(z.number().int().positive()).min(1).max(10),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format'),
});

// --- Featured Listing Schemas ---
export const featuredListingSchema = z.object({
  service_type: z.enum(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet']).optional().nullable(),
});

// --- Cancellation Policy Schemas ---
export const cancellationPolicySchema = z.object({
  cancellation_policy: z.enum(['flexible', 'moderate', 'strict'], {
    message: 'Policy must be flexible, moderate, or strict',
  }),
});

// --- OAuth Schemas ---
export const oauthSchema = z.object({
  provider: z.enum(['google', 'apple', 'facebook']),
  token: z.string().min(1, 'Token is required'),
});

export const setPasswordSchema = z.object({
  password: passwordSchema,
});

// --- Expense Schemas ---
export const expenseSchema = z.object({
  category: z.enum(['supplies', 'transportation', 'insurance', 'marketing', 'equipment', 'training', 'other'], {
    message: 'Category must be supplies, transportation, insurance, marketing, equipment, training, or other',
  }),
  amount: z.number().positive('Amount must be positive').max(99999, 'Amount must be under $100,000'),
  description: z.string().max(500, 'Description must be under 500 characters').optional().nullable(),
  date: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime()), 'Date must be a valid YYYY-MM-DD date'),
  receipt_url: z.string().url('Receipt URL must be a valid URL').optional().nullable().or(z.literal('')),
});

// --- Subscription Schemas ---
export const emptyBodySchema = z.object({});

// --- Admin Schemas ---
export const approvalDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'banned'], { message: 'Status must be "approved", "rejected", or "banned"' }),
  reason: z.string().max(500, 'Reason must be under 500 characters').optional(),
});

// --- Profile Import Schemas ---
export const importPreviewSchema = z.object({
  url: z.string().url('Must be a valid URL').refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return (parsed.hostname === 'rover.com' || parsed.hostname === 'www.rover.com')
          && parsed.pathname.startsWith('/members/');
      } catch { return false; }
    },
    'Must be a Rover profile URL (https://www.rover.com/members/{username})'
  ),
});

export const verifyImportSchema = z.object({
  profile_id: z.number().int().positive('Invalid profile ID'),
});

export const confirmImportSchema = z.object({
  profile_id: z.number().int().positive('Invalid profile ID'),
});

// --- Booking Filter Schemas ---
const bookingStatusValues = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const bookingFiltersSchema = z.object({
  start: z.string().regex(datePattern, 'start must be YYYY-MM-DD').optional(),
  end: z.string().regex(datePattern, 'end must be YYYY-MM-DD').optional(),
  status: z.enum(bookingStatusValues, { message: 'Invalid booking status' }).optional(),
  search: z.string().max(100, 'Search term must be under 100 characters').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
}).refine(
  (data) => !data.start || !data.end || data.start <= data.end,
  { message: 'start date must be before or equal to end date', path: ['start'] }
);

// --- Analytics Date Range Schema ---
export const analyticsDateRangeSchema = z.object({
  start: z.string().regex(datePattern, 'start must be YYYY-MM-DD').optional(),
  end: z.string().regex(datePattern, 'end must be YYYY-MM-DD').optional(),
}).refine(
  (data) => !data.start || !data.end || data.start <= data.end,
  { message: 'start date must be before or equal to end date', path: ['start'] }
);

// --- Availability Schema ---
const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;

export const availabilitySchema = z.object({
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  specific_date: z.string().regex(datePattern, 'specific_date must be YYYY-MM-DD').nullable().optional(),
  start_time: z.string().regex(timePattern, 'start_time must be HH:MM or HH:MM:SS'),
  end_time: z.string().regex(timePattern, 'end_time must be HH:MM or HH:MM:SS'),
  recurring: z.boolean().optional(),
}).refine(
  (data) => data.start_time < data.end_time,
  { message: 'end_time must be after start_time', path: ['end_time'] }
).refine(
  (data) => data.day_of_week != null || data.specific_date != null,
  { message: 'Either day_of_week or specific_date is required', path: ['day_of_week'] }
);

// --- Verification Update Schema ---
export const verificationUpdateSchema = z.object({
  house_photos_url: z.string().url('house_photos_url must be a valid URL').max(2048)
    .refine((url) => url.startsWith('https://'), 'URL must use HTTPS'),
});

// --- Notification Preferences Schemas ---
export const notificationPreferencesSchema = z.object({
  email_enabled: z.boolean().optional(),
  new_booking: z.boolean().optional(),
  booking_status: z.boolean().optional(),
  new_message: z.boolean().optional(),
  walk_updates: z.boolean().optional(),
});

// --- Payment Schemas ---
export const paymentIntentSchema = z.object({
  booking_id: z.number().int().positive(),
  payment_method: z.enum(['card', 'ach_debit']).optional(),
});

export const paymentActionSchema = z.object({
  booking_id: z.number().int().positive(),
});

// --- Import Apply Profile Schema ---
export const applyProfileSchema = z.object({
  profile_id: z.number().int().positive('Invalid profile ID'),
});

// --- Upload Signed URL Schema ---
const validFolders = ['pets', 'avatars', 'verifications', 'walks', 'sitter-photos', 'videos'] as const;
const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'] as const;

export const signedUrlSchema = z.object({
  folder: z.enum(validFolders, { message: 'folder must be one of: pets, avatars, verifications, walks, sitter-photos, videos' }),
  contentType: z.enum(allowedContentTypes, { message: 'contentType must be one of: image/jpeg, image/png, image/webp, image/gif, video/mp4, video/quicktime, video/webm' }),
  fileSize: z.number().int().positive('fileSize must be a positive integer'),
});

// --- Calendar Schemas ---
export const calendarQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
