import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ADDON_SLUGS } from '../shared/addon-catalog.ts';

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
const nameSchema = (msg: string) => z.string().transform((v) => v.trim()).pipe(z.string().min(1, msg));

// --- Auth Schemas ---
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema('Name is required'),
  age_confirmed: z
    .boolean()
    .refine((val) => val === true, 'You must confirm you are 13 years or older'),
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
  accepted_pet_sizes: z.array(z.enum(['small', 'medium', 'large', 'giant'])).optional(),
  accepted_species: z.array(z.enum(['dog', 'cat', 'bird', 'reptile', 'small_animal'])).optional(),
  years_experience: z.number().int().min(0).max(50).optional().nullable(),
  home_type: z.enum(homeTypes).optional().nullable(),
  has_yard: z.boolean().optional().nullable(),
  has_fenced_yard: z.boolean().optional().nullable(),
  has_own_pets: z.boolean().optional().nullable(),
  own_pets_description: z.string().max(500).optional().nullable(),
  skills: z.array(z.enum(sitterSkills)).max(10).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  service_radius_miles: z.number().int().min(1).max(100).optional().nullable(),
  max_pets_at_once: z.number().int().min(1).max(20).optional().nullable(),
  max_pets_per_walk: z.number().int().min(1).max(10).optional().nullable(),
  house_rules: z.string().max(2000).optional().nullable(),
  emergency_procedures: z.string().max(2000).optional().nullable(),
  has_insurance: z.boolean().optional().nullable(),
  emergency_contact_name: z.string().max(200).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  emergency_contact_relationship: z.string().max(100).optional().nullable(),
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
const careCategory = ['feeding', 'medication', 'exercise', 'grooming', 'behavioral', 'litter_box', 'cage_cleaning', 'habitat_maintenance', 'other'] as const;

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
  pickup_dropoff: z.boolean().optional().default(false),
  grooming_addon: z.boolean().optional().default(false),
  addon_ids: z.array(z.number().int().positive('Invalid add-on ID')).max(12, 'Maximum 12 add-ons per booking').refine((ids) => new Set(ids).size === ids.length, 'Duplicate add-on IDs are not allowed').optional().default([]),
}).refine(
  (data) => new Date(data.end_time) > new Date(data.start_time),
  { message: 'end_time must be after start_time', path: ['end_time'] }
);

export const updateBookingStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled'], { message: 'Status must be "confirmed" or "cancelled"' }),
});

// --- Inquiry Schemas ---
export const createInquirySchema = z.object({
  sitter_id: z.number().int().positive('Invalid sitter ID'),
  service_type: z.enum(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet', 'daycare']).optional(),
  pet_ids: z.array(z.number().int().positive('Invalid pet ID')).min(1, 'At least one pet is required').max(10, 'Maximum 10 pets').refine((ids) => new Set(ids).size === ids.length, 'Duplicate pet IDs are not allowed'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message must be under 2000 characters'),
});

export const sendOfferSchema = z.object({
  offer_price_cents: z.number().int().min(100, 'Minimum offer is $1.00').max(999900, 'Price must be under $10,000'),
  offer_start_time: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'offer_start_time must be a valid date'),
  offer_end_time: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'offer_end_time must be a valid date'),
  offer_notes: z.string().max(1000, 'Notes must be under 1000 characters').optional(),
}).refine(
  (data) => new Date(data.offer_end_time) > new Date(data.offer_start_time),
  { message: 'offer_end_time must be after offer_start_time', path: ['offer_end_time'] }
);

// --- Service Schemas ---
export const serviceSchema = z.object({
  type: z.enum(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet', 'daycare'], { message: 'Type must be walking, sitting, drop-in, grooming, meet_greet, or daycare' }),
  price_cents: z.number().int().min(0, 'Price cannot be negative').max(999900, 'Price must be under $10,000'),
  description: z.string().max(1000, 'Description must be under 1000 characters').optional().nullable(),
  additional_pet_price_cents: z.number().int().min(0, 'Additional pet price cannot be negative').max(50000, 'Additional pet price must be under $500').optional().default(0),
  max_pets: z.number().int().min(1, 'Must accept at least 1 pet').max(20, 'Maximum 20 pets').optional().default(1),
  service_details: z.record(z.string(), z.unknown()).refine(
    (obj) => JSON.stringify(obj).length <= 5000,
    'Service details must be under 5KB'
  ).optional().nullable(),
  species: z.enum(['dog', 'cat', 'bird', 'reptile', 'small_animal']).optional().nullable(),
  holiday_rate_cents: z.number().int().min(0).max(999900).optional().nullable(),
  puppy_rate_cents: z.number().int().min(0).max(999900).optional().nullable(),
  pickup_dropoff_fee_cents: z.number().int().min(0).max(50000).optional().nullable(),
  grooming_addon_fee_cents: z.number().int().min(0).max(50000).optional().nullable(),
});

export const speciesProfileSchema = z.object({
  years_experience: z.number().int().min(0).max(99).optional().nullable(),
  accepted_pet_sizes: z.array(z.enum(['small', 'medium', 'large', 'giant'])).max(4).optional().default([]),
  skills: z.array(z.enum(sitterSkills)).max(10).optional().default([]),
  max_pets: z.number().int().min(1).max(20).optional().default(1),
  max_pets_per_walk: z.number().int().min(1).max(10).optional().nullable(),
  has_yard: z.boolean().optional().default(false),
  has_fenced_yard: z.boolean().optional().default(false),
  dogs_on_furniture: z.boolean().optional().default(false),
  dogs_on_bed: z.boolean().optional().default(false),
  potty_break_frequency: z.string().max(100).optional().nullable(),
  accepts_puppies: z.boolean().optional().default(true),
  accepts_unspayed: z.boolean().optional().default(true),
  accepts_unneutered: z.boolean().optional().default(true),
  accepts_females_in_heat: z.boolean().optional().default(true),
  owns_same_species: z.boolean().optional().default(false),
  own_pets_description: z.string().max(500).optional().nullable(),
});

// --- Sitter Add-on Schemas ---
const addonSlugEnum = z.enum(ADDON_SLUGS as [string, ...string[]], { message: 'Invalid add-on type' });
export const sitterAddonSchema = z.object({
  addon_slug: addonSlugEnum,
  price_cents: z.number().int().min(0, 'Price cannot be negative').max(50000, 'Price must be under $500'),
  notes: z.string().max(500, 'Notes must be under 500 characters').optional().nullable(),
});

export const updateSitterAddonSchema = z.object({
  price_cents: z.number().int().min(0, 'Price cannot be negative').max(50000, 'Price must be under $500'),
  notes: z.string().max(500, 'Notes must be under 500 characters').optional().nullable(),
});

// --- Tip Schemas ---
export const createTipSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  amount_cents: z.number().int().min(50, 'Minimum tip is $0.50').max(100000, 'Tip cannot exceed $1,000'),
});

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

// --- Sitter Post Schemas ---
export const createSitterPostSchema = z.object({
  content: z.string().trim().min(1, 'Content cannot be empty').max(2000, 'Post content must be under 2000 characters').optional(),
  photo_url: z.string().url('A valid photo URL is required').refine((url) => url.startsWith('https://'), 'Photo URL must use HTTPS').optional(),
  video_url: z.string().url('A valid video URL is required').refine((url) => url.startsWith('https://'), 'Video URL must use HTTPS').optional(),
  post_type: z.enum(['update', 'walk_photo', 'walk_video', 'care_update']).default('update'),
}).refine(
  (data) => data.content || data.photo_url || data.video_url,
  { message: 'Post must have content, a photo, or a video' }
);

// --- Review Schemas ---
const subRating = z.number().int().min(1, 'Sub-rating must be 1-5').max(5, 'Sub-rating must be 1-5').optional().nullable();

export const createReviewSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  comment: z.string().max(2000, 'Comment must be under 2000 characters').optional().nullable(),
  pet_care_rating: subRating,
  communication_rating: subRating,
  reliability_rating: subRating,
  pet_accuracy_rating: subRating,
  preparedness_rating: subRating,
});

export const reviewResponseSchema = z.object({
  response_text: z.string().trim().min(1, 'Response is required').max(1000, 'Response must be under 1000 characters'),
});

// --- Quick-Tap Care Event Schemas ---
export const quickTapEventSchema = z.object({
  event_type: z.enum(['start', 'pee', 'poop', 'photo', 'end', 'fed', 'water', 'medication', 'nap_start', 'nap_end', 'play', 'video', 'litter_box', 'habitat_check']),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// --- Expense Schemas ---
export const expenseSchema = z.object({
  category: z.enum(['supplies', 'transportation', 'insurance', 'marketing', 'equipment', 'training', 'other'], {
    message: 'Category must be supplies, transportation, insurance, marketing, equipment, training, or other',
  }),
  amount_cents: z.number().int().positive('Amount must be positive').max(10000000, 'Amount must be under $100,000'),
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
  booking_reminders: z.boolean().optional(),
  booking_reminders_email: z.boolean().optional(),
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

// --- Incident Report Schemas ---
const incidentCategories = ['pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other'] as const;

export const createIncidentSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  category: z.enum(incidentCategories, { message: 'Invalid incident category' }),
  description: z.string().trim().min(1, 'Description is required').max(2000, 'Description must be under 2000 characters'),
  notes: z.string().max(1000, 'Notes must be under 1000 characters').optional().nullable(),
  evidence: z.array(z.object({
    media_url: z.string().url('Invalid media URL').refine((url) => url.startsWith('https://'), 'Media URL must use HTTPS'),
    media_type: z.enum(['image', 'video'], { message: 'media_type must be image or video' }),
  })).max(4, 'Maximum 4 evidence items').optional().default([]),
});

// --- Dispute Schemas ---
const disputeStatuses = ['under_review', 'awaiting_response', 'closed'] as const;
const resolutionTypes = ['full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action'] as const;

export const createDisputeSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  incident_id: z.number().int().positive('Invalid incident ID').optional().nullable(),
  reason: z.string().trim().min(1, 'Reason is required').max(2000, 'Reason must be under 2000 characters'),
});

export const disputeMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message is required').max(2000, 'Message must be under 2000 characters'),
  is_admin_note: z.boolean().optional().default(false),
  evidence_urls: z.array(
    z.string().url('Invalid URL').refine((url) => url.startsWith('https://'), 'URL must use HTTPS')
  ).max(4, 'Maximum 4 evidence items').optional().default([]),
});

export const resolveDisputeSchema = z.object({
  resolution_type: z.enum(resolutionTypes, { message: 'Invalid resolution type' }),
  resolution_amount_cents: z.number().int().min(1, 'Refund amount must be at least $0.01').max(999900, 'Refund must be under $10,000').optional().nullable(),
  resolution_notes: z.string().trim().min(1, 'Resolution notes are required').max(2000, 'Notes must be under 2000 characters'),
});

export const updateDisputeStatusSchema = z.object({
  status: z.enum(disputeStatuses, { message: 'Status must be under_review, awaiting_response, or closed' }),
});

// --- Credit Schemas ---
const creditTypes = ['promo', 'beta_reward', 'milestone'] as const;

export const issueCreditSchema = z.object({
  user_id: z.number().int().positive('Invalid user ID'),
  amount_cents: z.number().int().min(1, 'Amount must be at least $0.01').max(500000, 'Amount must be under $5,000'),
  type: z.enum(creditTypes, { message: 'Invalid credit type' }),
  description: z.string().trim().min(1, 'Description is required').max(500, 'Description must be under 500 characters'),
  expires_at: z.string().datetime().optional().nullable(),
});

// --- Private Pet Note Schema ---
const petNoteFlags = ['aggressive', 'special_needs_undisclosed', 'medical_condition', 'other'] as const;

export const privatePetNoteSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(2000, 'Content must be under 2000 characters'),
  flags: z.array(z.enum(petNoteFlags, { message: 'Invalid flag' })).max(4).default([]),
  booking_id: z.number().int().positive('Invalid booking ID'),
});

// --- Upload Signed URL Schema ---
const validFolders = ['pets', 'avatars', 'verifications', 'walks', 'sitter-photos', 'videos', 'posts', 'incidents', 'disputes'] as const;
const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'] as const;

export const signedUrlSchema = z.object({
  folder: z.enum(validFolders, { message: 'folder must be one of: pets, avatars, verifications, walks, sitter-photos, videos, posts, incidents, disputes' }),
  contentType: z.enum(allowedContentTypes, { message: 'contentType must be one of: image/jpeg, image/png, image/webp, image/gif, video/mp4, video/quicktime, video/webm' }),
  fileSize: z.number().int().positive('fileSize must be a positive integer'),
});

// --- Sitter Search Schemas ---
export const sitterSearchSchema = z.object({
  serviceType: z.enum(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet', 'daycare']).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(500).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  petSize: z.enum(['small', 'medium', 'large', 'giant']).optional(),
  species: z.enum(['dog', 'cat', 'bird', 'reptile', 'small_animal']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// --- Profile View Schemas ---
export const profileViewSchema = z.object({
  source: z.string().max(32).optional(),
  session_id: z.string().max(64).optional(),
});

// --- Calendar Schemas ---
export const calendarQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// --- Reference Schemas ---
export const inviteReferenceSchema = z.object({
  client_name: z.string().min(1, 'Name is required').max(200),
  client_email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const submitVouchSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1, 'Please write a brief comment').max(2000),
});

// --- Manual Import Schema ---
export const manualImportSchema = z.object({
  platform: z.string().min(1, 'Platform is required').max(50),
  reviewer_name: z.string().min(1, 'Reviewer name is required').max(200),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

// --- Message Search Schema ---
export const messageSearchSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(200),
  userId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
