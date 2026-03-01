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
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must not exceed 72 characters');
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
export const updateProfileSchema = z.object({
  name: nameSchema('Name is required'),
  bio: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable().or(z.literal('')),
  role: z.enum(['owner', 'sitter', 'both']).optional(),
});

// --- Pet Schemas ---
export const petSchema = z.object({
  name: nameSchema('Pet name is required'),
  breed: z.string().optional().nullable(),
  age: z.number().int().min(0).max(50).optional().nullable(),
  weight: z.number().min(0).max(500).optional().nullable(),
  medical_history: z.string().optional().nullable(),
  photo_url: z.string().url().optional().nullable().or(z.literal('')),
});

// --- Booking Schemas ---
export const createBookingSchema = z.object({
  sitter_id: z.number().int().positive('Invalid sitter ID'),
  service_id: z.number().int().positive('Invalid service ID'),
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
  type: z.enum(['walking', 'sitting', 'drop-in', 'grooming'], { message: 'Type must be walking, sitting, drop-in, or grooming' }),
  price: z.number().min(1, 'Price must be at least $1').max(9999, 'Price must be under $10,000'),
  description: z.string().max(1000, 'Description must be under 1000 characters').optional().nullable(),
});

// --- Sitter Photo Schemas ---
export const createSitterPhotoSchema = z.object({
  photo_url: z.string().url('A valid photo URL is required').refine((url) => url.startsWith('https://'), 'Photo URL must use HTTPS'),
  caption: z.string().max(200, 'Caption must be under 200 characters').optional().default(''),
  sort_order: z.number().int().min(0).max(9).optional().default(0),
});

export const updateSitterPhotoSchema = z.object({
  caption: z.string().max(200, 'Caption must be under 200 characters').optional(),
  sort_order: z.number().int().min(0).optional(),
});

// --- Review Schemas ---
export const createReviewSchema = z.object({
  booking_id: z.number().int().positive('Invalid booking ID'),
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  comment: z.string().optional().nullable(),
});
