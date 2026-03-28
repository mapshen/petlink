import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDb } from './src/server/db.ts';
import sql from './src/server/db.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, authMiddleware, type AuthenticatedRequest } from './src/server/auth.ts';
import { createPaymentIntent, createACHPaymentIntent, createFinancialConnectionsSession, listBankAccounts, detachBankAccount, capturePayment, cancelPayment, refundPayment, constructWebhookEvent, createSubscriptionCheckout, createSubscriptionIntent, cancelStripeSubscription, listPaymentMethods, detachPaymentMethod, listCharges } from './src/server/payments.ts';
import { getOrCreateStripeCustomer } from './src/server/stripe-customers.ts';
import { createNotification, getUserNotifications, getUnreadCount, markAsRead, markAllAsRead, getPreferences, updatePreferences } from './src/server/notifications.ts';
import { generateUploadUrl } from './src/server/storage.ts';
import { validate, signupSchema, loginSchema, updateProfileSchema, petSchema, petVaccinationSchema, serviceSchema, createBookingSchema, updateBookingStatusSchema, createReviewSchema, createSitterPhotoSchema, updateSitterPhotoSchema, cancellationPolicySchema, oauthSchema, setPasswordSchema, updateCareInstructionsSchema, quickTapEventSchema, createRecurringBookingSchema, expenseSchema, featuredListingSchema, emptyBodySchema, approvalDecisionSchema, importPreviewSchema, verifyImportSchema, confirmImportSchema, calendarQuerySchema, bookingFiltersSchema, analyticsDateRangeSchema } from './src/server/validation.ts';
import { getCalendarData } from './src/server/calendar.ts';
import { generateCalendarToken, revokeCalendarToken, validateCalendarToken, generateICS, type ICSEvent } from './src/server/calendar-export.ts';
import { parseRoverUrl, generateVerificationCode, scrapeRoverProfile, checkVerificationCode } from './src/server/profile-import.ts';
import { verifyOAuthToken } from './src/server/oauth.ts';
import { calculateRefund, getPolicyDescription } from './src/server/cancellation.ts';
import { calculateBookingPrice } from './src/server/multi-pet-pricing.ts';
import { schedulePayoutForBooking, getPayoutDelay, getPayoutsForSitter, getPendingPayoutsForSitter } from './src/server/payouts.ts';
import { botBlockMiddleware } from './src/server/bot-detection.ts';
import { createCandidate, createInvitation, verifyWebhookSignature, parseWebhookEvent, mapCheckrStatus, isCheckrConfigured } from './src/server/checkr.ts';
import { calculateRankingScore, isNewSitter, type SitterStats } from './src/server/sitter-ranking.ts';
import { requireSitterRole, validateYear, validateRevenuePeriod, getOverview, getClients, getClientDetail, getRevenue } from './src/server/analytics.ts';
import { createPublicLimiter, createApiLimiter, createAuthLimiter } from './src/server/rate-limit.ts';
import { sendEmail, buildBookingConfirmationEmail, buildBookingStatusEmail, buildNewMessageEmail, buildSitterNewBookingEmail, buildApprovalStatusEmail } from './src/server/email.ts';
import { adminMiddleware, isAdminUser } from './src/server/admin.ts';
import { format as formatDate } from 'date-fns';
import type { ErrorRequestHandler } from 'express';

// Wraps async route handlers to forward rejected promises to Express error middleware
function asyncHandler(fn: (...args: any[]) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    fn(req, res, next).catch(next);
  };
}

// Creates an Express Router that auto-wraps async handlers with error catching
function createAsyncRouter(): ReturnType<typeof express.Router> {
  const router = express.Router();
  const methods = ['get', 'post', 'put', 'delete'] as const;
  for (const method of methods) {
    const original = router[method].bind(router);
    (router as any)[method] = (path: string, ...handlers: any[]) => {
      const wrapped = handlers.map((h: any) =>
        typeof h === 'function' && h.constructor.name === 'AsyncFunction'
          ? asyncHandler(h)
          : h
      );
      return original(path, ...wrapped);
    };
  }
  return router;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize DB
  await initDb();

  const app = express();
  const httpServer = createServer(app);
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
    throw new Error('APP_URL environment variable is required in production');
  }
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? process.env.APP_URL!
    : '*';
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://js.stripe.com", "https://accounts.google.com", "https://appleid.cdn-apple.com", "https://connect.facebook.net"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://i.pravatar.cc", "https://ui-avatars.com"],
            connectSrc: ["'self'", "wss:", "https://api.stripe.com", "https://nominatim.openstreetmap.org", "https://accounts.google.com", "https://appleid.apple.com", "https://graph.facebook.com"],
            frameSrc: ["https://js.stripe.com", "https://accounts.google.com", "https://appleid.apple.com", "https://www.facebook.com"],
            fontSrc: ["'self'"],
          },
        }
      : false,
  }));
  app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"]
    }
  });
  const PORT = parseInt(process.env.PORT || '3002', 10);

  // Raw body needed for Stripe webhook signature verification
  app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(cookieParser());

  // robots.txt — block crawlers from API (before any middleware)
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /api/\n');
  });

  // Rate limiting (skip in development)
  const apiLimiter = createApiLimiter();
  const authLimiter = createAuthLimiter();
  const publicLimiter = createPublicLimiter();

  // Health check (before rate limiting, no auth)
  app.get('/api/v1/health', async (_req, res) => {
    try {
      await sql`SELECT 1`;
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database unreachable' });
    }
  });

  // X-Robots-Tag header for all API responses
  app.use('/api/v1/', (_req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
  app.use('/api/', (_req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

  app.use('/api/v1/', apiLimiter);
  app.use('/api/v1/auth/', authLimiter);

  // Backwards compatibility: /api/* also works (same routes)
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);

  // All versioned API routes — async handlers auto-wrapped with error catching
  const v1 = createAsyncRouter();

  // --- Auth ---
  v1.post('/auth/signup', validate(signupSchema), async (req, res) => {
    const { email, password, name, role } = req.body;

    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = hashPassword(password);
    const isSitterRole = role === 'sitter' || role === 'both';
    const approvalStatus = isSitterRole ? 'pending_approval' : 'approved';
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, role, approval_status)
      VALUES (${email}, ${passwordHash}, ${name}, ${role}, ${approvalStatus})
      RETURNING id, email, name, role, bio, avatar_url, lat, lng, approval_status
    `;
    const token = signToken({ userId: user.id });

    res.status(201).json({ user, token });
  });

  v1.post('/auth/login', validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.approval_status === 'banned') {
      res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
      return;
    }

    const token = signToken({ userId: user.id });
    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  v1.post('/auth/oauth', validate(oauthSchema), async (req, res) => {
    const { provider, token } = req.body;

    const profile = await verifyOAuthToken(provider, token);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.begin(async (tx: any) => {
      // Check for existing OAuth link
      const [existingOAuth] = await tx`
        SELECT user_id FROM oauth_accounts
        WHERE provider = ${profile.provider} AND provider_id = ${profile.providerId}
      `;

      if (existingOAuth) {
        const [user] = await tx`
          SELECT id, email, name, role, bio, avatar_url FROM users WHERE id = ${existingOAuth.user_id}
        `;
        return { user, isNewUser: false };
      }

      // Check for existing user by email (only auto-link if provider verified the email)
      if (profile.email && profile.emailVerified) {
        const [existingUser] = await tx`
          SELECT id, email, name, role, bio, avatar_url FROM users WHERE email = ${profile.email}
        `;

        if (existingUser) {
          await tx`
            INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, avatar_url)
            VALUES (${existingUser.id}, ${profile.provider}, ${profile.providerId}, ${profile.email}, ${profile.name}, ${profile.avatarUrl})
          `;
          return { user: existingUser, isNewUser: false };
        }
      }

      // Require email for new account creation
      if (!profile.email) {
        throw new Error('Email is required. Please grant email permission and try again.');
      }

      // Create new user
      const [newUser] = await tx`
        INSERT INTO users (email, password_hash, name, role, email_verified)
        VALUES (${profile.email}, ${null}, ${profile.name || 'User'}, ${'owner'}, ${profile.emailVerified})
        RETURNING id, email, name, role, bio, avatar_url
      `;

      await tx`
        INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, avatar_url)
        VALUES (${newUser.id}, ${profile.provider}, ${profile.providerId}, ${profile.email}, ${profile.name}, ${profile.avatarUrl})
      `;

      return { user: newUser, isNewUser: true };
    });

    if (!result.isNewUser) {
      const [fullUser] = await sql`SELECT approval_status FROM users WHERE id = ${result.user.id}`;
      if (fullUser?.approval_status === 'banned') {
        res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        return;
      }
    }

    const jwtToken = signToken({ userId: result.user.id });
    res.json({ user: result.user, token: jwtToken, isNewUser: result.isNewUser });
  });

  v1.get('/auth/linked-accounts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const accounts = await sql`
      SELECT provider, email, created_at FROM oauth_accounts WHERE user_id = ${req.userId}
    `;
    res.json({ accounts });
  });

  v1.delete('/auth/linked-accounts/:provider', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { provider } = req.params;
    const validProviders = ['google', 'apple', 'facebook'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: 'Invalid provider' });
      return;
    }

    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.userId}`;
    const otherAccounts = await sql`
      SELECT id FROM oauth_accounts WHERE user_id = ${req.userId} AND provider != ${provider}
    `;

    if (!user.password_hash && otherAccounts.length === 0) {
      res.status(400).json({ error: 'Cannot unlink the last authentication method. Set a password first.' });
      return;
    }

    const result = await sql`
      DELETE FROM oauth_accounts WHERE user_id = ${req.userId} AND provider = ${provider}
    `;

    if (result.count === 0) {
      res.status(404).json({ error: 'Linked account not found' });
      return;
    }

    res.json({ message: 'Account unlinked' });
  });

  v1.post('/auth/set-password', authMiddleware, validate(setPasswordSchema), async (req: AuthenticatedRequest, res) => {
    const { password } = req.body;

    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.userId}`;
    if (user.password_hash) {
      res.status(400).json({ error: 'Password already set. Use profile settings to change it.' });
      return;
    }

    const hashedPassword = hashPassword(password);
    await sql`UPDATE users SET password_hash = ${hashedPassword} WHERE id = ${req.userId}`;

    res.json({ message: 'Password set successfully' });
  });

  v1.get('/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`
      SELECT id, email, name, role, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, approval_status, approval_rejected_reason FROM users WHERE id = ${req.userId}
    `;
    if (user) {
      res.json({ user: { ...user, is_admin: isAdminUser(user.email) } });
    } else {
      res.status(401).json({ error: 'User not found' });
    }
  });

  // --- Users ---
  v1.put('/users/me', authMiddleware, validate(updateProfileSchema), async (req: AuthenticatedRequest, res) => {
    const { name, bio, avatar_url, role, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles } = req.body;

    // Check if user is switching from owner to sitter/both
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    const becomingSitter = role && (role === 'sitter' || role === 'both') && currentUser.role === 'owner';

    await sql`
      UPDATE users SET name = ${name}, bio = ${bio || null}, avatar_url = ${avatar_url || null},
      role = COALESCE(${role || null}::user_role, role)
      ${becomingSitter ? sql`, approval_status = 'pending_approval'` : sql``}
      ${accepted_species !== undefined ? sql`, accepted_species = ${accepted_species || []}` : sql``}
      ${years_experience !== undefined ? sql`, years_experience = ${years_experience}` : sql``}
      ${home_type !== undefined ? sql`, home_type = ${home_type || null}` : sql``}
      ${has_yard !== undefined ? sql`, has_yard = ${has_yard ?? false}` : sql``}
      ${has_fenced_yard !== undefined ? sql`, has_fenced_yard = ${has_fenced_yard ?? false}` : sql``}
      ${has_own_pets !== undefined ? sql`, has_own_pets = ${has_own_pets ?? false}` : sql``}
      ${own_pets_description !== undefined ? sql`, own_pets_description = ${own_pets_description || null}` : sql``}
      ${skills !== undefined ? sql`, skills = ${skills || []}` : sql``}
      ${service_radius_miles !== undefined ? sql`, service_radius_miles = ${service_radius_miles}` : sql``}
      WHERE id = ${req.userId}
    `;

    const [user] = await sql`
      SELECT id, email, name, role, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, approval_status, approval_rejected_reason FROM users WHERE id = ${req.userId}
    `;

    res.json({ user: { ...user, is_admin: isAdminUser(user.email) } });
  });

  // --- Pets ---
  v1.get('/pets', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const pets = await sql`SELECT * FROM pets WHERE owner_id = ${req.userId}`;
    res.json({ pets });
  });

  v1.post('/pets', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    const { name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url } = req.body;
    const [pet] = await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url)
      VALUES (${req.userId}, ${name}, ${species || 'dog'}, ${breed || null}, ${age ?? null}, ${weight ?? null}, ${gender || null}, ${spayed_neutered ?? null}, ${energy_level || null}, ${house_trained ?? null}, ${temperament || []}, ${special_needs || null}, ${microchip_number || null}, ${vet_name || null}, ${vet_phone || null}, ${emergency_contact_name || null}, ${emergency_contact_phone || null}, ${medical_history || null}, ${photo_url || null})
      RETURNING *
    `;
    res.status(201).json({ pet });
  });

  v1.put('/pets/:id', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT * FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const { name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url } = req.body;
    const [updated] = await sql`
      UPDATE pets SET name = ${name}, species = ${species || 'dog'}, breed = ${breed || null}, age = ${age ?? null},
      weight = ${weight ?? null}, gender = ${gender || null}, spayed_neutered = ${spayed_neutered ?? null},
      energy_level = ${energy_level || null}, house_trained = ${house_trained ?? null}, temperament = ${temperament || []},
      special_needs = ${special_needs || null}, microchip_number = ${microchip_number || null},
      vet_name = ${vet_name || null}, vet_phone = ${vet_phone || null},
      emergency_contact_name = ${emergency_contact_name || null}, emergency_contact_phone = ${emergency_contact_phone || null},
      medical_history = ${medical_history || null}, photo_url = ${photo_url || null}
      WHERE id = ${req.params.id} AND owner_id = ${req.userId}
      RETURNING *
    `;
    res.json({ pet: updated });
  });

  v1.delete('/pets/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT * FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    await sql`DELETE FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Pet Vaccinations ---
  v1.get('/pets/:petId/vaccinations', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const vaccinations = await sql`SELECT * FROM pet_vaccinations WHERE pet_id = ${req.params.petId} ORDER BY expires_at DESC NULLS LAST, created_at DESC`;
    res.json({ vaccinations });
  });

  v1.post('/pets/:petId/vaccinations', authMiddleware, validate(petVaccinationSchema), async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const { vaccine_name, administered_date, expires_at, document_url } = req.body;
    const [vaccination] = await sql`
      INSERT INTO pet_vaccinations (pet_id, vaccine_name, administered_date, expires_at, document_url)
      VALUES (${req.params.petId}, ${vaccine_name}, ${administered_date || null}, ${expires_at || null}, ${document_url || null})
      RETURNING *
    `;
    res.status(201).json({ vaccination });
  });

  v1.delete('/pets/:petId/vaccinations/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const [vacc] = await sql`SELECT id FROM pet_vaccinations WHERE id = ${req.params.id} AND pet_id = ${req.params.petId}`;
    if (!vacc) {
      res.status(404).json({ error: 'Vaccination record not found' });
      return;
    }
    await sql`DELETE FROM pet_vaccinations WHERE id = ${req.params.id} AND pet_id = ${req.params.petId}`;
    res.json({ success: true });
  });

  // --- Pet Care Instructions ---
  v1.put('/pets/:id/care-instructions', authMiddleware, validate(updateCareInstructionsSchema), async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const { care_instructions } = req.body;
    const [updated] = await sql`
      UPDATE pets SET care_instructions = ${sql.json(care_instructions)}
      WHERE id = ${req.params.id} AND owner_id = ${req.userId}
      RETURNING id, care_instructions
    `;
    res.json({ pet: updated });
  });

  v1.get('/pets/:id/care-instructions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id, name, care_instructions FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    res.json({ pet_id: pet.id, pet_name: pet.name, care_instructions: pet.care_instructions || [] });
  });

  // --- Booking Care Tasks ---
  v1.get('/bookings/:bookingId/care-tasks', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, owner_id, sitter_id FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }
    const tasks = await sql`
      SELECT bct.*, p.name as pet_name
      FROM booking_care_tasks bct
      JOIN pets p ON bct.pet_id = p.id
      WHERE bct.booking_id = ${req.params.bookingId}
      ORDER BY bct.pet_id, bct.time NULLS LAST, bct.created_at
    `;
    res.json({ tasks });
  });

  v1.put('/bookings/:bookingId/care-tasks/:taskId/complete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      res.status(400).json({ error: 'Tasks can only be updated on active bookings' });
      return;
    }
    if (booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can complete tasks' });
      return;
    }
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${req.params.taskId} AND booking_id = ${req.params.bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = TRUE, completed_at = NOW()
      WHERE id = ${req.params.taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  v1.put('/bookings/:bookingId/care-tasks/:taskId/uncomplete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      res.status(400).json({ error: 'Tasks can only be updated on active bookings' });
      return;
    }
    if (booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can update tasks' });
      return;
    }
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${req.params.taskId} AND booking_id = ${req.params.bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = FALSE, completed_at = NULL
      WHERE id = ${req.params.taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  // --- Sitters ---
  v1.get('/sitters', botBlockMiddleware, publicLimiter, async (req, res) => {
    const serviceType = req.query.serviceType as string | undefined;
    const lat = req.query.lat as string | undefined;
    const lng = req.query.lng as string | undefined;
    const radius = req.query.radius as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    const petSize = req.query.petSize as string | undefined;
    const speciesParam = req.query.species as string | undefined;
    const validSpecies = ['dog', 'cat', 'bird', 'reptile', 'small_animal'];
    const species = speciesParam && validSpecies.includes(speciesParam) ? speciesParam : undefined;

    const hasGeo = lat && lng && radius;
    const geoPoint = hasGeo ? sql`ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography` : sql``;

    const sitters = await sql`
      SELECT u.id, u.name, u.role, u.bio, u.avatar_url,
             ROUND(u.lat::numeric, 2)::float as lat, ROUND(u.lng::numeric, 2)::float as lng,
             u.accepted_pet_sizes, u.accepted_species, u.years_experience, u.skills, u.created_at,
             s.price, s.type as service_type, s.max_pets
             ${hasGeo ? sql`, ST_Distance(u.location, ${geoPoint}) as distance_meters` : sql``}
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      WHERE u.role IN ('sitter', 'both')
        AND u.approval_status = 'approved'
        ${serviceType ? sql`AND s.type = ${serviceType}` : sql``}
        ${minPrice ? sql`AND s.price >= ${Number(minPrice)}` : sql``}
        ${maxPrice ? sql`AND s.price <= ${Number(maxPrice)}` : sql``}
        ${petSize ? sql`AND ${petSize} = ANY(u.accepted_pet_sizes)` : sql``}
        ${species ? sql`AND ${species} = ANY(u.accepted_species)` : sql``}
        ${hasGeo ? sql`AND ST_DWithin(u.location, ${geoPoint}, ${Number(radius)})` : sql``}
    `;

    // Compute ranking scores for each sitter
    const sitterIds = sitters.map((s: { id: number }) => s.id);
    const statsMap = new Map<number, Record<string, any>>();

    if (sitterIds.length > 0) {
      const stats = await sql`
        SELECT
          u.id as sitter_id,
          COALESCE(rv.avg_rating, 0) as avg_rating,
          COALESCE(rv.review_count, 0)::int as review_count,
          COALESCE(bk.completed, 0)::int as completed,
          COALESCE(bk.total, 0)::int as total,
          COALESCE(bk.avg_response_hours, 0)::float as avg_response_hours,
          COALESCE(bk.repeat_owners, 0)::int as repeat_owners,
          COALESCE(bk.unique_owners, 0)::int as unique_owners,
          COALESCE(sc.service_count, 0)::int as service_count,
          COALESCE(av.has_avail, false) as has_availability
        FROM users u
        LEFT JOIN LATERAL (
          SELECT AVG(r.rating)::float as avg_rating, COUNT(*)::int as review_count
          FROM reviews r WHERE r.reviewee_id = u.id AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        ) rv ON true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE b.status = 'completed')::int as completed,
            COUNT(*)::int as total,
            AVG(EXTRACT(EPOCH FROM (b.responded_at - b.created_at)) / 3600) FILTER (WHERE b.responded_at IS NOT NULL)::float as avg_response_hours,
            COUNT(DISTINCT b.owner_id) FILTER (WHERE b.status = 'completed' AND b.owner_id IN (SELECT b2.owner_id FROM bookings b2 WHERE b2.sitter_id = u.id AND b2.status = 'completed' GROUP BY b2.owner_id HAVING COUNT(*) > 1))::int as repeat_owners,
            COUNT(DISTINCT b.owner_id) FILTER (WHERE b.status = 'completed')::int as unique_owners
          FROM bookings b WHERE b.sitter_id = u.id
        ) bk ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as service_count FROM services sv WHERE sv.sitter_id = u.id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT EXISTS(SELECT 1 FROM availability a WHERE a.sitter_id = u.id) as has_avail
        ) av ON true
        WHERE u.id = ANY(${sitterIds})
      `;
      for (const s of stats) {
        statsMap.set(s.sitter_id, s);
      }
    }

    const ranked = sitters.map((sitter: any) => {
      const s = statsMap.get(sitter.id);
      const sitterStats: SitterStats = {
        avg_rating: s?.avg_rating || null,
        review_count: s?.review_count || 0,
        completed_bookings: s?.completed || 0,
        total_bookings: s?.total || 0,
        avg_response_hours: s?.avg_response_hours || null,
        repeat_owner_count: s?.repeat_owners || 0,
        unique_owner_count: s?.unique_owners || 0,
        has_avatar: Boolean(sitter.avatar_url),
        has_bio: Boolean(sitter.bio),
        service_count: s?.service_count || 0,
        has_availability: Boolean(s?.has_availability),
        created_at: sitter.created_at,
        distance_meters: sitter.distance_meters,
      };
      return {
        ...sitter,
        ranking_score: calculateRankingScore(sitterStats),
        is_new: isNewSitter(sitter.created_at),
        review_count: s?.review_count || 0,
        avg_rating: s?.avg_rating ? Number(s.avg_rating.toFixed(1)) : null,
      };
    });

    ranked.sort((a: any, b: any) => b.ranking_score - a.ranking_score);

    res.json({ sitters: ranked });
  });

  v1.get('/sitters/:id', botBlockMiddleware, publicLimiter, async (req, res) => {
    const [sitter] = await sql`
      SELECT id, name, role, bio, avatar_url, ROUND(lat::numeric, 2)::float as lat, ROUND(lng::numeric, 2)::float as lng, accepted_pet_sizes, accepted_species, cancellation_policy, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles FROM users WHERE id = ${req.params.id} AND role IN ('sitter', 'both') AND approval_status = 'approved'
    `;
    if (!sitter) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }

    const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.params.id}`;
    const photos = await sql`SELECT * FROM sitter_photos WHERE sitter_id = ${req.params.id} ORDER BY sort_order, created_at`;

    // Public review stats (not gated behind auth)
    const [reviewStats] = await sql`
      SELECT
        AVG(r.rating)::float as avg_rating,
        COUNT(*)::int as review_count
      FROM reviews r
      WHERE r.reviewee_id = ${req.params.id}
        AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
    `;

    // Reviews only returned for authenticated users
    const authHeader = req.headers.authorization;
    let reviews: any[] = [];
    if (authHeader?.startsWith('Bearer ')) {
      reviews = await sql`
        SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
        FROM reviews r
        JOIN users u ON r.reviewer_id = u.id
        WHERE r.reviewee_id = ${req.params.id} AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        ORDER BY r.created_at DESC
      `;
    }

    const imported_reviews = await sql`
      SELECT ir.id, ir.platform, ir.reviewer_name, ir.rating, ir.comment, ir.review_date
      FROM imported_reviews ir
      JOIN imported_profiles ip ON ir.imported_profile_id = ip.id
      WHERE ir.sitter_id = ${req.params.id} AND ip.verification_status = 'verified'
      ORDER BY ir.review_date DESC NULLS LAST
    `;

    const sitterWithStats = {
      ...sitter,
      avg_rating: reviewStats.avg_rating ? Number(reviewStats.avg_rating.toFixed(1)) : null,
      review_count: reviewStats.review_count,
    };

    res.json({ sitter: sitterWithStats, services, reviews, photos, imported_reviews });
  });

  // --- Services (sitter CRUD) ---
  v1.get('/services/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.userId}`;
    res.json({ services });
  });

  v1.post('/services', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const { type, price, description, additional_pet_price, max_pets, service_details } = req.body;
    const [existing] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type}`;
    if (existing) {
      res.status(409).json({ error: `You already have a ${type} service. Edit it instead.` });
      return;
    }
    const [service] = await sql`
      INSERT INTO services (sitter_id, type, price, description, additional_pet_price, max_pets, service_details)
      VALUES (${req.userId}, ${type}, ${price}, ${description || null}, ${additional_pet_price || 0}, ${max_pets || 1}, ${service_details ? sql.json(service_details) : null})
      RETURNING *
    `;
    res.status(201).json({ service });
  });

  v1.put('/services/:id', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const { type, price, description, additional_pet_price, max_pets, service_details } = req.body;
    const [updated] = await sql`
      UPDATE services SET type = ${type}, price = ${price}, description = ${description || null}, additional_pet_price = ${additional_pet_price || 0},
      max_pets = ${max_pets || 1}, service_details = ${service_details ? sql.json(service_details) : null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ service: updated });
  });

  v1.delete('/services/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    await sql`DELETE FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Reviews (double-blind) ---
  v1.post('/reviews', authMiddleware, validate(createReviewSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, rating, comment } = req.body;

    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${booking_id}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    if (booking.status !== 'completed') {
      res.status(400).json({ error: 'Can only review completed bookings' });
      return;
    }

    const isOwner = booking.owner_id === req.userId;
    const isSitter = booking.sitter_id === req.userId;
    if (!isOwner && !isSitter) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }

    const revieweeId = isOwner ? booking.sitter_id : booking.owner_id;

    const [existing] = await sql`SELECT id FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${req.userId}`;
    if (existing) {
      res.status(409).json({ error: 'You have already reviewed this booking' });
      return;
    }

    // Block reviews after 3-day window if the other party already reviewed (prevents retaliation)
    const [otherReview] = await sql`SELECT id, created_at FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${revieweeId}`;
    if (otherReview) {
      const otherAge = Date.now() - new Date(otherReview.created_at).getTime();
      if (otherAge > 3 * 24 * 60 * 60 * 1000) {
        res.status(403).json({ error: 'The review window for this booking has closed' });
        return;
      }
    }

    const [review] = await sql`
      INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment)
      VALUES (${booking_id}, ${req.userId}, ${revieweeId}, ${rating}, ${comment || null})
      RETURNING id
    `;

    if (otherReview) {
      await sql`UPDATE reviews SET published_at = NOW() WHERE booking_id = ${booking_id} AND published_at IS NULL`;
    }

    res.status(201).json({ id: review.id });
  });

  // Get reviews for a user (only published ones)
  v1.get('/reviews/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const reviews = await sql`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ${req.params.userId} AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
      ORDER BY r.created_at DESC
    `;

    res.json({ reviews });
  });

  // --- Sitter Verification ---
  v1.get('/verification/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${req.userId}`;
    res.json({ verification: verification || null });
  });

  v1.post('/verification/start', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role, email, name FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can start verification' });
      return;
    }

    const [existing] = await sql`SELECT id FROM verifications WHERE sitter_id = ${req.userId}`;
    if (existing) {
      res.status(409).json({ error: 'Verification already started' });
      return;
    }

    let checkrCandidateId: string | null = null;
    let checkrInvitationUrl: string | null = null;

    if (isCheckrConfigured()) {
      try {
        const nameParts = (user.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Unknown';
        const candidate = await createCandidate(user.email, firstName, lastName);
        checkrCandidateId = candidate.id;

        const invitation = await createInvitation(candidate.id);
        checkrInvitationUrl = invitation.invitation_url;
      } catch (err) {
        console.error('Checkr integration error:', err);
        // Fall through — create verification record without Checkr
      }
    }

    const [verification] = await sql`
      INSERT INTO verifications (sitter_id, submitted_at, checkr_candidate_id, checkr_invitation_url, background_check_status)
      VALUES (${req.userId}, NOW(), ${checkrCandidateId}, ${checkrInvitationUrl}, ${checkrCandidateId ? 'submitted' : 'pending'}::bg_check_status)
      RETURNING *
    `;
    res.status(201).json({ verification });
  });

  v1.put('/verification/update', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { house_photos_url } = req.body;
    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${req.userId}`;
    if (!verification) {
      res.status(404).json({ error: 'No verification found. Start verification first.' });
      return;
    }
    const [updated] = await sql`
      UPDATE verifications SET house_photos_url = ${house_photos_url} WHERE sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ verification: updated });
  });

  // Webhook endpoint for background check results (supports both Checkr and legacy format)
  v1.post('/webhooks/background-check', async (req, res) => {
    // Checkr webhook format detection
    const event = parseWebhookEvent(req.body);
    if (event && event.type && event.data?.object?.candidate_id) {
      // Checkr webhook — verify signature if secret configured
      const checkrSecret = process.env.CHECKR_WEBHOOK_SECRET;
      if (checkrSecret) {
        const signature = req.headers['x-checkr-signature'] as string || '';
        const rawBody = JSON.stringify(req.body);
        if (!verifyWebhookSignature(rawBody, signature, checkrSecret)) {
          res.status(401).json({ error: 'Invalid webhook signature' });
          return;
        }
      }

      // Only process report.completed events
      if (event.type !== 'report.completed') {
        res.json({ received: true, ignored: true });
        return;
      }

      const report = event.data.object;
      const [verification] = await sql`SELECT * FROM verifications WHERE checkr_candidate_id = ${report.candidate_id}`;
      if (!verification) {
        res.status(404).json({ error: 'Verification not found for candidate' });
        return;
      }

      const bgStatus = mapCheckrStatus(report.status, report.result, report.adjudication);
      await sql`UPDATE verifications SET background_check_status = ${bgStatus}::bg_check_status, checkr_report_id = ${report.id} WHERE checkr_candidate_id = ${report.candidate_id}`;

      const [updated] = await sql`SELECT * FROM verifications WHERE checkr_candidate_id = ${report.candidate_id}`;
      if (updated.background_check_status === 'passed' && updated.id_check_status === 'approved') {
        await sql`UPDATE verifications SET completed_at = NOW() WHERE id = ${updated.id}`;
      }

      res.json({ success: true });
      return;
    }

    // Legacy webhook format (sitter_id + status)
    const webhookSecret = process.env.BG_CHECK_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-webhook-signature'];
      if (signature !== webhookSecret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const { sitter_id, status } = req.body;
    if (!sitter_id || !status) {
      res.status(400).json({ error: 'sitter_id and status are required' });
      return;
    }
    const validStatuses = ['submitted', 'passed', 'failed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${sitter_id}`;
    if (!verification) {
      res.status(404).json({ error: 'Verification not found' });
      return;
    }

    await sql`UPDATE verifications SET background_check_status = ${status}::bg_check_status WHERE sitter_id = ${sitter_id}`;

    const [updated] = await sql`SELECT * FROM verifications WHERE sitter_id = ${sitter_id}`;
    if (updated.background_check_status === 'passed' && updated.id_check_status === 'approved') {
      await sql`UPDATE verifications SET completed_at = NOW() WHERE sitter_id = ${sitter_id}`;
    }

    res.json({ success: true });
  });

  // Get verification status for a sitter (public)
  v1.get('/verification/:sitterId', botBlockMiddleware, publicLimiter, async (req, res) => {
    const [verification] = await sql`
      SELECT id_check_status, background_check_status, completed_at FROM verifications WHERE sitter_id = ${req.params.sitterId}
    `;
    res.json({ verification: verification || null });
  });

  // --- Availability ---
  v1.get('/availability/:sitterId', botBlockMiddleware, publicLimiter, async (req, res) => {
    const slots = await sql`
      SELECT * FROM availability WHERE sitter_id = ${req.params.sitterId} ORDER BY day_of_week, start_time
    `;
    res.json({ slots });
  });

  v1.post('/availability', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot set availability yet.' });
      return;
    }
    const { day_of_week, specific_date, start_time, end_time, recurring } = req.body;
    if (start_time == null || end_time == null) {
      res.status(400).json({ error: 'start_time and end_time are required' });
      return;
    }
    const [slot] = await sql`
      INSERT INTO availability (sitter_id, day_of_week, specific_date, start_time, end_time, recurring)
      VALUES (${req.userId}, ${day_of_week ?? null}, ${specific_date || null}, ${start_time}, ${end_time}, ${recurring ? true : false})
      RETURNING *
    `;
    res.status(201).json({ slot });
  });

  v1.delete('/availability/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [slot] = await sql`SELECT * FROM availability WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!slot) {
      res.status(404).json({ error: 'Availability slot not found' });
      return;
    }
    await sql`DELETE FROM availability WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Sitter Photos ---
  v1.get('/sitter-photos/:sitterId', botBlockMiddleware, publicLimiter, async (req, res) => {
    const photos = await sql`
      SELECT * FROM sitter_photos WHERE sitter_id = ${req.params.sitterId} ORDER BY sort_order, created_at
    `;
    res.json({ photos });
  });

  v1.post('/sitter-photos', authMiddleware, validate(createSitterPhotoSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can upload photos' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot upload photos yet.' });
      return;
    }
    const { photo_url, caption, sort_order } = req.body;
    // Atomic insert with limit check to prevent race condition
    const [photo] = await sql`
      INSERT INTO sitter_photos (sitter_id, photo_url, caption, sort_order)
      SELECT ${req.userId}, ${photo_url}, ${caption}, ${sort_order}
      WHERE (SELECT COUNT(*) FROM sitter_photos WHERE sitter_id = ${req.userId}) < 10
      RETURNING *
    `;
    if (!photo) {
      res.status(400).json({ error: 'Maximum 10 photos allowed' });
      return;
    }
    res.status(201).json({ photo });
  });

  v1.put('/sitter-photos/:id', authMiddleware, validate(updateSitterPhotoSchema), async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    const { caption, sort_order } = req.body;
    const [photo] = await sql`
      UPDATE sitter_photos SET
        caption = COALESCE(${caption ?? null}, caption),
        sort_order = COALESCE(${sort_order ?? null}, sort_order)
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ photo });
  });

  v1.delete('/sitter-photos/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    await sql`DELETE FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Favorites ---
  v1.get('/favorites', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const favorites = await sql`
      SELECT f.id, f.sitter_id, f.created_at,
             u.name as sitter_name, u.avatar_url as sitter_avatar, u.bio as sitter_bio
      FROM favorites f
      JOIN users u ON f.sitter_id = u.id
      WHERE f.user_id = ${req.userId}
      ORDER BY f.created_at DESC
    `;
    res.json({ favorites });
  });

  v1.post('/favorites/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    if (sitterId === req.userId) {
      res.status(400).json({ error: 'Cannot favorite yourself' });
      return;
    }
    const [sitter] = await sql`SELECT id, role FROM users WHERE id = ${sitterId}`;
    if (!sitter || (sitter.role !== 'sitter' && sitter.role !== 'both')) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }
    const [existing] = await sql`SELECT id FROM favorites WHERE user_id = ${req.userId} AND sitter_id = ${sitterId}`;
    if (existing) {
      res.status(409).json({ error: 'Already favorited' });
      return;
    }
    const [{ count: favCount }] = await sql`SELECT count(*)::int as count FROM favorites WHERE user_id = ${req.userId}`;
    if (favCount >= 100) {
      res.status(400).json({ error: 'Maximum of 100 favorites reached' });
      return;
    }
    const [favorite] = await sql`
      INSERT INTO favorites (user_id, sitter_id) VALUES (${req.userId}, ${sitterId}) RETURNING *
    `;
    res.status(201).json({ favorite });
  });

  v1.delete('/favorites/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    const [deleted] = await sql`
      DELETE FROM favorites WHERE user_id = ${req.userId} AND sitter_id = ${sitterId} RETURNING id
    `;
    if (!deleted) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }
    res.json({ success: true });
  });

  // --- Recurring Bookings ---
  v1.get('/recurring-bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const recurring = await sql`
      SELECT rb.*, u.name as sitter_name, s.type as service_type
      FROM recurring_bookings rb
      JOIN users u ON rb.sitter_id = u.id
      JOIN services s ON rb.service_id = s.id
      WHERE rb.owner_id = ${req.userId}
      ORDER BY rb.created_at DESC
    `;
    res.json({ recurring_bookings: recurring });
  });

  v1.post('/recurring-bookings', authMiddleware, validate(createRecurringBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time } = req.body;

    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot create recurring booking with yourself' });
      return;
    }

    const [service] = await sql`SELECT id FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    const ownerPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
    if (ownerPets.length !== pet_ids.length) {
      res.status(400).json({ error: 'One or more pets not found' });
      return;
    }

    // Calculate next occurrence
    const now = new Date();
    const today = now.getDay();
    let daysUntil = day_of_week - today;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntil);
    const nextOccurrence = nextDate.toISOString().split('T')[0];

    const [recurring] = await sql`
      INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time, next_occurrence)
      VALUES (${req.userId}, ${sitter_id}, ${service_id}, ${pet_ids}, ${frequency}, ${day_of_week}, ${start_time}, ${end_time}, ${nextOccurrence})
      RETURNING *
    `;
    res.status(201).json({ recurring_booking: recurring });
  });

  v1.put('/recurring-bookings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = FALSE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  v1.put('/recurring-bookings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = TRUE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  v1.delete('/recurring-bookings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    await sql`DELETE FROM recurring_bookings WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });

  // --- Recurring Bookings ---
  v1.get('/recurring-bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const recurring = await sql`
      SELECT rb.*, u.name as sitter_name, s.type as service_type
      FROM recurring_bookings rb
      JOIN users u ON rb.sitter_id = u.id
      JOIN services s ON rb.service_id = s.id
      WHERE rb.owner_id = ${req.userId}
      ORDER BY rb.created_at DESC
    `;
    res.json({ recurring_bookings: recurring });
  });

  v1.post('/recurring-bookings', authMiddleware, validate(createRecurringBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time } = req.body;

    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot create recurring booking with yourself' });
      return;
    }

    const [service] = await sql`SELECT id FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    const ownerPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
    if (ownerPets.length !== pet_ids.length) {
      res.status(400).json({ error: 'One or more pets not found' });
      return;
    }

    // Calculate next occurrence
    const now = new Date();
    const today = now.getDay();
    let daysUntil = day_of_week - today;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntil);
    const nextOccurrence = nextDate.toISOString().split('T')[0];

    const [recurring] = await sql`
      INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time, next_occurrence)
      VALUES (${req.userId}, ${sitter_id}, ${service_id}, ${pet_ids}, ${frequency}, ${day_of_week}, ${start_time}, ${end_time}, ${nextOccurrence})
      RETURNING *
    `;
    res.status(201).json({ recurring_booking: recurring });
  });

  v1.put('/recurring-bookings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = FALSE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  v1.put('/recurring-bookings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = TRUE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  v1.delete('/recurring-bookings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    await sql`DELETE FROM recurring_bookings WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });

  // --- Featured Listings (per-booking commission model) ---
  v1.get('/featured-listings/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const listings = await sql`SELECT * FROM featured_listings WHERE sitter_id = ${req.userId} ORDER BY created_at DESC`;
    res.json({ listings });
  });

  v1.post('/featured-listings', authMiddleware, validate(featuredListingSchema), async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can create featured listings' });
      return;
    }
    const { service_type } = req.body;

    if (service_type) {
      const [existing] = await sql`SELECT id FROM featured_listings WHERE sitter_id = ${req.userId} AND service_type = ${service_type}`;
      if (existing) {
        res.status(409).json({ error: 'You already have a featured listing for this service type' });
        return;
      }
    }

    const [listing] = await sql`
      INSERT INTO featured_listings (sitter_id, service_type)
      VALUES (${req.userId}, ${service_type || null})
      RETURNING *
    `;
    res.status(201).json({ listing });
  });

  v1.put('/featured-listings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    const [updated] = await sql`UPDATE featured_listings SET active = FALSE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ listing: updated });
  });

  v1.put('/featured-listings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    const [updated] = await sql`UPDATE featured_listings SET active = TRUE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ listing: updated });
  });

  v1.delete('/featured-listings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    await sql`DELETE FROM featured_listings WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });

  // --- Sitter Subscription ---
  v1.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can view subscriptions' });
      return;
    }
    const [sub] = await sql`
      SELECT id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
      FROM sitter_subscriptions WHERE sitter_id = ${req.userId}
    `;
    res.json({ subscription: sub || null });
  });

  v1.post('/subscription/create-intent', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT role, email FROM users WHERE id = ${req.userId}`;
      if (user.role !== 'sitter' && user.role !== 'both') {
        res.status(403).json({ error: 'Only sitters can subscribe' });
        return;
      }
      const [existing] = await sql`SELECT tier FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
      if (existing && existing.tier === 'pro') {
        res.status(409).json({ error: 'Already subscribed to Pro' });
        return;
      }
      const priceId = process.env.STRIPE_PRO_PRICE_ID;
      if (!priceId) {
        res.status(503).json({ error: 'Subscription payments not configured' });
        return;
      }
      const customerId = await getOrCreateStripeCustomer(req.userId!, user.email);
      const result = await createSubscriptionIntent(customerId, priceId);
      res.json(result);
    } catch (error) {
      console.error('Subscription intent error:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  v1.post('/subscription/upgrade', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role, email FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can subscribe' });
      return;
    }

    const [existing] = await sql`SELECT id, tier FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
    if (existing && existing.tier === 'pro') {
      res.status(409).json({ error: 'Already subscribed to Pro' });
      return;
    }

    try {
      const origin = `${req.protocol}://${req.get('host')}`;
      const checkoutUrl = await createSubscriptionCheckout(req.userId!, user.email, origin);
      res.json({ checkout_url: checkoutUrl });
    } catch (error: any) {
      if (error.message?.includes('STRIPE_PRO_PRICE_ID')) {
        // Stripe not configured — activate directly (dev/beta mode)
        if (existing) {
          const [updated] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              UPDATE sitter_subscriptions SET tier = 'pro', status = 'active',
                current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
              WHERE sitter_id = ${req.userId}
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${req.userId}`;
            return [s];
          });
          res.json({ subscription: updated });
        } else {
          const [sub] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              INSERT INTO sitter_subscriptions (sitter_id, tier, status, current_period_start, current_period_end)
              VALUES (${req.userId}, 'pro', 'active', NOW(), NOW() + INTERVAL '30 days')
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${req.userId}`;
            return [s];
          });
          res.status(201).json({ subscription: sub });
        }
        return;
      }
      throw error;
    }
  });

  v1.post('/subscription/cancel', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    const [sub] = await sql`
      SELECT id, stripe_subscription_id
      FROM sitter_subscriptions WHERE sitter_id = ${req.userId} AND tier = 'pro' AND status = 'active'
    `;
    if (!sub) {
      res.status(404).json({ error: 'No active Pro subscription' });
      return;
    }

    // Cancel via Stripe if subscription was created through Stripe
    if (sub.stripe_subscription_id) {
      try {
        await cancelStripeSubscription(sub.stripe_subscription_id);
      } catch (error) {
        console.error('Stripe cancel error:', error);
      }
    }

    const [updated] = await sql.begin(async (tx: any) => {
      const [s] = await tx`
        UPDATE sitter_subscriptions SET status = 'cancelled', tier = 'free', updated_at = NOW()
        WHERE sitter_id = ${req.userId}
        RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
      `;
      await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${req.userId}`;
      return [s];
    });
    res.json({ subscription: updated });
  });

  // --- Walk Events ---
  v1.get('/walks/:bookingId/events', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }
    const events = await sql`
      SELECT we.*, p.name as pet_name
      FROM walk_events we
      LEFT JOIN pets p ON we.pet_id = p.id
      WHERE we.booking_id = ${req.params.bookingId}
      ORDER BY we.created_at ASC
    `;
    res.json({ events });
  });

  v1.post('/walks/:bookingId/events', authMiddleware, validate(quickTapEventSchema), async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking || booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can log walk events' });
      return;
    }
    const { event_type, lat, lng, note, photo_url, video_url, pet_id } = req.body;

    // Limit video clips to 5 per booking
    if (event_type === 'video') {
      const [{ count }] = await sql`SELECT count(*)::int as count FROM walk_events WHERE booking_id = ${req.params.bookingId} AND event_type = 'video'`;
      if (count >= 5) {
        res.status(400).json({ error: 'Maximum 5 video clips per booking' });
        return;
      }
    }

    if (pet_id != null) {
      const [validPet] = await sql`SELECT 1 FROM booking_pets WHERE booking_id = ${req.params.bookingId} AND pet_id = ${pet_id}`;
      if (!validPet) {
        res.status(400).json({ error: 'Pet is not part of this booking' });
        return;
      }
    }
    const [event] = await sql`
      INSERT INTO walk_events (booking_id, event_type, lat, lng, note, photo_url, video_url, pet_id)
      VALUES (${req.params.bookingId}, ${event_type}, ${lat || null}, ${lng || null}, ${note || null}, ${photo_url || null}, ${video_url || null}, ${pet_id || null})
      RETURNING *
    `;

    // If event is 'start', update booking to in_progress and notify owner
    if (event_type === 'start') {
      await sql`UPDATE bookings SET status = 'in_progress' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const startNotif = await createNotification(booking.owner_id, 'walk_started', 'Walk Started', `${sitterUser.name} has started the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', startNotif);
    }
    // If event is 'end', update booking to completed, schedule payout, and notify owner
    if (event_type === 'end') {
      await sql`UPDATE bookings SET status = 'completed' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const endNotif = await createNotification(booking.owner_id, 'walk_completed', 'Walk Completed', `${sitterUser.name} has completed the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', endNotif);

      // Schedule delayed payout for sitter
      // NOTE: Payouts are currently only triggered for walk-type bookings (via walk end event).
      // This is acceptable for now since walks are the only booking type with a completion path.
      if (booking.total_price && booking.total_price > 0) {
        const delayDays = await getPayoutDelay(booking.sitter_id);
        await schedulePayoutForBooking(
          Number(req.params.bookingId),
          booking.sitter_id,
          booking.total_price,
          delayDays
        );
      }
    }

    res.status(201).json({ event });
  });

  // --- Care Summary (auto-generated from events) ---
  v1.get('/walks/:bookingId/summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }

    const events = await sql`
      SELECT we.event_type, we.note, we.created_at, p.name as pet_name
      FROM walk_events we
      LEFT JOIN pets p ON we.pet_id = p.id
      WHERE we.booking_id = ${req.params.bookingId}
      ORDER BY we.created_at ASC
    `;

    // Build summary counts
    const counts: Record<string, number> = {};
    const notes: string[] = [];
    let startTime: string | null = null;
    let endTime: string | null = null;

    for (const e of events) {
      counts[e.event_type] = (counts[e.event_type] || 0) + 1;
      if (e.note) notes.push(e.note);
      if (e.event_type === 'start') startTime = e.created_at;
      if (e.event_type === 'end') endTime = e.created_at;
    }

    const duration = startTime && endTime
      ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
      : null;

    res.json({
      summary: {
        total_events: events.length,
        duration_minutes: duration,
        counts,
        notes,
        events,
      },
    });
  });

  // --- Cancellation Policy ---
  v1.get('/cancellation-policy', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT cancellation_policy FROM users WHERE id = ${req.userId}`;
    res.json({ cancellation_policy: user.cancellation_policy || 'flexible' });
  });

  v1.put('/cancellation-policy', authMiddleware, validate(cancellationPolicySchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can set cancellation policy' });
      return;
    }
    const { cancellation_policy } = req.body;
    await sql`UPDATE users SET cancellation_policy = ${cancellation_policy} WHERE id = ${req.userId}`;
    res.json({ cancellation_policy });
  });

  // --- Expenses ---
  v1.get('/expenses', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can access expenses' });
      return;
    }
    const year = req.query.year ? Number(req.query.year) : null;
    const month = req.query.month ? Number(req.query.month) : null;

    let expenses;
    if (year && month) {
      expenses = await sql`
        SELECT * FROM sitter_expenses
        WHERE sitter_id = ${req.userId}
          AND EXTRACT(YEAR FROM date) = ${year}
          AND EXTRACT(MONTH FROM date) = ${month}
        ORDER BY date DESC
      `;
    } else if (year) {
      expenses = await sql`
        SELECT * FROM sitter_expenses
        WHERE sitter_id = ${req.userId}
          AND EXTRACT(YEAR FROM date) = ${year}
        ORDER BY date DESC
      `;
    } else {
      expenses = await sql`
        SELECT * FROM sitter_expenses
        WHERE sitter_id = ${req.userId}
        ORDER BY date DESC
      `;
    }

    const total = expenses.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);
    res.json({ expenses, total });
  });

  v1.get('/expenses/tax-summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can access tax summary' });
      return;
    }
    const year = Number(req.query.year) || new Date().getFullYear();

    const [incomeRow] = await sql`
      SELECT COALESCE(SUM(total_price), 0)::float AS total_income
      FROM bookings
      WHERE sitter_id = ${req.userId}
        AND status = 'completed'
        AND EXTRACT(YEAR FROM start_time) = ${year}
    `;

    const expenseRows = await sql`
      SELECT category, SUM(amount)::float AS total
      FROM sitter_expenses
      WHERE sitter_id = ${req.userId}
        AND EXTRACT(YEAR FROM date) = ${year}
      GROUP BY category
    `;

    const total_expenses = expenseRows.reduce((sum: number, r: { total: number }) => sum + r.total, 0);
    const expense_by_category: Record<string, number> = {};
    for (const row of expenseRows) {
      expense_by_category[row.category] = row.total;
    }

    res.json({
      year,
      total_income: incomeRow.total_income,
      total_expenses,
      net_income: incomeRow.total_income - total_expenses,
      expense_by_category,
    });
  });

  v1.post('/expenses', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can create expenses' });
      return;
    }
    const { category, amount, description, date, receipt_url } = req.body;
    const [expense] = await sql`
      INSERT INTO sitter_expenses (sitter_id, category, amount, description, date, receipt_url)
      VALUES (${req.userId}, ${category}, ${amount}, ${description ?? null}, ${date}, ${receipt_url ?? null})
      RETURNING *
    `;
    res.status(201).json({ expense });
  });

  v1.put('/expenses/:id', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    const { category, amount, description, date, receipt_url } = req.body;
    const [expense] = await sql`
      UPDATE sitter_expenses SET
        category = ${category},
        amount = ${amount},
        description = ${description ?? null},
        date = ${date},
        receipt_url = ${receipt_url ?? null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ expense });
  });

  v1.delete('/expenses/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    await sql`DELETE FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Bookings ---
  v1.post('/bookings', authMiddleware, validate(createBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, start_time, end_time } = req.body;

    const startMs = new Date(start_time).getTime();
    const endMs = new Date(end_time).getTime();
    if (startMs < Date.now()) {
      res.status(400).json({ error: 'Cannot book in the past' });
      return;
    }
    const durationMs = endMs - startMs;
    const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
    if (durationMs > MAX_DURATION_MS) {
      res.status(400).json({ error: 'Booking duration cannot exceed 24 hours' });
      return;
    }
    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot book yourself' });
      return;
    }
    const [sitterUser] = await sql`SELECT approval_status FROM users WHERE id = ${sitter_id}`;
    if (!sitterUser || sitterUser.approval_status !== 'approved') {
      res.status(400).json({ error: 'This sitter is not currently available for bookings' });
      return;
    }
    const [service] = await sql`SELECT id, price, type, additional_pet_price FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    // Verify all pets belong to the owner
    const ownerPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
    if (ownerPets.length !== pet_ids.length) {
      res.status(400).json({ error: 'One or more pets not found or do not belong to you' });
      return;
    }

    const totalPrice = calculateBookingPrice(service.price, service.additional_pet_price || 0, pet_ids.length);

    // Use transaction for booking + booking_pets + care tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const booking = await sql.begin(async (tx: any) => {
      const [b] = await tx`
        INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price, status)
        VALUES (${sitter_id}, ${req.userId}, ${service_id}, ${start_time}, ${end_time}, ${totalPrice}, 'pending')
        RETURNING id, status
      `;
      const petRows = pet_ids.map((petId: number) => ({ booking_id: b.id, pet_id: petId }));
      await tx`INSERT INTO booking_pets ${tx(petRows, 'booking_id', 'pet_id')}`;

      // Auto-populate care tasks from pet care instructions (inside transaction)
      const petsWithCare = await tx`SELECT id, care_instructions FROM pets WHERE id = ANY(${pet_ids}) AND care_instructions IS NOT NULL AND care_instructions != '[]'::jsonb`;
      const taskRows: { booking_id: number; pet_id: number; category: string; description: string; time: string | null; notes: string | null }[] = [];
      for (const pet of petsWithCare) {
        const raw = pet.care_instructions as unknown[];
        for (const item of raw) {
          if (typeof item !== 'object' || !item || !('category' in item) || !('description' in item)) continue;
          const instr = item as { category: string; description: string; time?: string; notes?: string };
          taskRows.push({ booking_id: b.id, pet_id: pet.id, category: instr.category, description: instr.description, time: instr.time || null, notes: instr.notes || null });
        }
      }
      if (taskRows.length > 0) {
        await tx`INSERT INTO booking_care_tasks ${tx(taskRows, 'booking_id', 'pet_id', 'category', 'description', 'time', 'notes')}`;
      }

      return b;
    });

    // Notify sitter of new booking
    const [owner] = await sql`SELECT name, email FROM users WHERE id = ${req.userId}`;
    const [sitter] = await sql`SELECT name, email FROM users WHERE id = ${sitter_id}`;
    const notification = await createNotification(sitter_id, 'new_booking', 'New Booking Request', `${owner.name} has requested a booking.`, { booking_id: booking.id });
    io.to(String(sitter_id)).emit('notification', notification);

    // Send email notifications (fire-and-forget)
    const formattedStart = formatDate(new Date(start_time), 'MMMM d, yyyy \'at\' h:mm a');
    const serviceName = service.type || 'Pet Service';
    const sitterPrefs = await getPreferences(sitter_id);
    if (sitterPrefs.email_enabled && sitterPrefs.new_booking) {
      const sitterEmail = buildSitterNewBookingEmail({ sitterName: sitter.name, ownerName: owner.name, serviceName, startTime: formattedStart, totalPrice: totalPrice });
      sendEmail({ to: sitter.email, ...sitterEmail }).catch(() => {});
    }
    const ownerPrefs = await getPreferences(req.userId!);
    if (ownerPrefs.email_enabled && ownerPrefs.new_booking) {
      const ownerEmail = buildBookingConfirmationEmail({ ownerName: owner.name, sitterName: sitter.name, serviceName, startTime: formattedStart, totalPrice: totalPrice });
      sendEmail({ to: owner.email, ...ownerEmail }).catch(() => {});
    }

    res.json({ id: booking.id, status: booking.status });
  });

  v1.get('/bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = bookingFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    const { start, end, status, search, limit, offset } = parsed.data;

    // Determine if the user is acting as owner or sitter for search filtering
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    const userRole: string = currentUser?.role ?? 'owner';

    // Count total matching rows for pagination
    const [{ count: totalCount }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${start ? sql`AND b.start_time >= ${start}::timestamptz` : sql``}
        ${end ? sql`AND b.start_time < ${end}::timestamptz` : sql``}
        ${status ? sql`AND b.status = ${status}` : sql``}
        ${search
          ? userRole === 'sitter'
            ? sql`AND o.name ILIKE ${'%' + search + '%'}`
            : userRole === 'owner'
              ? sql`AND s.name ILIKE ${'%' + search + '%'}`
              : sql`AND (o.name ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`
          : sql``}
    `;

    const bookings = await sql`
      SELECT b.*,
             s.name as sitter_name, s.avatar_url as sitter_avatar,
             o.name as owner_name, o.avatar_url as owner_avatar,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${start ? sql`AND b.start_time >= ${start}::timestamptz` : sql``}
        ${end ? sql`AND b.start_time < ${end}::timestamptz` : sql``}
        ${status ? sql`AND b.status = ${status}` : sql``}
        ${search
          ? userRole === 'sitter'
            ? sql`AND o.name ILIKE ${'%' + search + '%'}`
            : userRole === 'owner'
              ? sql`AND s.name ILIKE ${'%' + search + '%'}`
              : sql`AND (o.name ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`
          : sql``}
      ORDER BY b.start_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Batch-fetch pets for all bookings
    const bookingIds = bookings.map((b: { id: number }) => b.id);
    const bookingPets = bookingIds.length > 0
      ? await sql`
          SELECT bp.booking_id, p.id, p.name, p.photo_url, p.breed
          FROM booking_pets bp
          JOIN pets p ON bp.pet_id = p.id
          WHERE bp.booking_id = ANY(${bookingIds})
        `
      : [];
    const petsByBooking = bookingPets.reduce(
      (acc: Map<number, { id: number; name: string; photo_url: string | null; breed: string | null }[]>, row: { booking_id: number; id: number; name: string; photo_url: string | null; breed: string | null }) => {
        const existing = acc.get(row.booking_id) ?? [];
        return new Map([...acc, [row.booking_id, [...existing, { id: row.id, name: row.name, photo_url: row.photo_url, breed: row.breed }]]]);
      },
      new Map<number, { id: number; name: string; photo_url: string | null; breed: string | null }[]>(),
    );
    const enriched = bookings.map((b: { id: number }) => ({ ...b, pets: petsByBooking.get(b.id) || [] }));

    res.json({ bookings: enriched, total: totalCount });
  });

  // --- Booking Status Update ---
  v1.put('/bookings/:id/status', authMiddleware, validate(updateBookingStatusSchema), async (req: AuthenticatedRequest, res) => {
    const { status } = req.body;
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    // Atomic update with preconditions in WHERE clause to prevent race conditions
    let updated;
    if (status === 'confirmed') {
      [updated] = await sql`
        UPDATE bookings SET status = 'confirmed'::booking_status, responded_at = COALESCE(responded_at, NOW())
        WHERE id = ${bookingId} AND sitter_id = ${req.userId} AND status = 'pending'
        RETURNING *
      `;
    } else {
      // Cancelled — sitter can cancel pending, owner can cancel pending or confirmed
      [updated] = await sql`
        UPDATE bookings SET status = 'cancelled'::booking_status, responded_at = COALESCE(responded_at, NOW())
        WHERE id = ${bookingId}
          AND (
            (sitter_id = ${req.userId} AND status = 'pending')
            OR (owner_id = ${req.userId} AND status IN ('pending', 'confirmed'))
          )
        RETURNING *
      `;
    }

    if (!updated) {
      // Determine the specific error
      const [booking] = await sql`SELECT * FROM bookings WHERE id = ${bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.sitter_id !== req.userId && booking.owner_id !== req.userId) {
        res.status(403).json({ error: 'Not authorized to update this booking' });
        return;
      }
      res.status(409).json({ error: 'Booking status cannot be changed. It may have been updated already.' });
      return;
    }

    // Notifications are best-effort — don't fail the request if they error
    try {
      const isSitter = updated.sitter_id === req.userId;
      const [actingUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const otherUserId = isSitter ? updated.owner_id : updated.sitter_id;

      const title = status === 'confirmed' ? 'Booking Confirmed'
        : isSitter ? 'Booking Declined' : 'Booking Cancelled';
      const body = status === 'confirmed'
        ? `${actingUser.name} has confirmed your booking.`
        : isSitter
          ? `${actingUser.name} has declined your booking request.`
          : `${actingUser.name} has cancelled the booking.`;

      const notification = await createNotification(
        otherUserId, 'booking_status', title, body, { booking_id: bookingId }
      );
      io.to(String(otherUserId)).emit('notification', notification);

      // Send email notification for status change
      const [otherUser] = await sql`SELECT name, email FROM users WHERE id = ${otherUserId}`;
      const otherPrefs = await getPreferences(otherUserId);
      if (otherPrefs.email_enabled && otherPrefs.booking_status) {
        const [svc] = await sql`SELECT type FROM services WHERE id = ${updated.service_id}`;
        const statusEmail = buildBookingStatusEmail({
          recipientName: otherUser.name,
          otherPartyName: actingUser.name,
          status: status as 'confirmed' | 'cancelled',
          serviceName: svc?.type || 'Pet Service',
          startTime: formatDate(new Date(updated.start_time), 'MMMM d, yyyy \'at\' h:mm a'),
        });
        sendEmail({ to: otherUser.email, ...statusEmail }).catch(() => {});
      }
    } catch {
      // Notification failed — booking status was already updated successfully
    }

    // Calculate refund for owner-initiated cancellations of confirmed bookings with held payments
    let refund = null;
    if (status === 'cancelled' && updated.owner_id === req.userId && updated.payment_status === 'held' && updated.payment_intent_id) {
      try {
        const [sitter] = await sql`SELECT cancellation_policy FROM users WHERE id = ${updated.sitter_id}`;
        const policy = sitter.cancellation_policy || 'flexible';
        refund = calculateRefund(policy, Math.round((updated.total_price || 0) * 100), new Date(updated.start_time), new Date());

        if (refund.refundAmount > 0) {
          await refundPayment(updated.payment_intent_id, refund.refundAmount);
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
        } else {
          // No refund — sitter keeps the full amount
          await capturePayment(updated.payment_intent_id);
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${bookingId}`;
        }
      } catch (err) {
        console.error(`Refund failed for booking ${bookingId}:`, err);
        refund = null; // Don't send misleading refund info to client
      }
    } else if (status === 'cancelled' && updated.payment_intent_id && updated.payment_status === 'held') {
      // Sitter-initiated cancellation of pending booking — full refund
      try {
        await cancelPayment(updated.payment_intent_id);
        await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
      } catch (err) {
        console.error(`Payment cancellation failed for booking ${bookingId}:`, err);
      }
    }

    res.json({ booking: updated, refund });
  });

  // --- Messages ---
  v1.get('/conversations', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const conversations = await sql`
      WITH last_messages AS (
        SELECT DISTINCT ON (
          LEAST(sender_id, receiver_id),
          GREATEST(sender_id, receiver_id)
        )
          sender_id,
          receiver_id,
          content,
          created_at
        FROM messages
        WHERE sender_id = ${req.userId} OR receiver_id = ${req.userId}
        ORDER BY
          LEAST(sender_id, receiver_id),
          GREATEST(sender_id, receiver_id),
          created_at DESC
      ),
      unread_counts AS (
        SELECT sender_id AS from_user, COUNT(*)::int AS unread
        FROM messages
        WHERE receiver_id = ${req.userId} AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT
        u.id AS other_user_id,
        u.name AS other_user_name,
        u.avatar_url AS other_user_avatar,
        lm.content AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(uc.unread, 0)::int AS unread_count
      FROM last_messages lm
      JOIN users u ON u.id = CASE
        WHEN lm.sender_id = ${req.userId} THEN lm.receiver_id
        ELSE lm.sender_id
      END
      LEFT JOIN unread_counts uc ON uc.from_user = u.id
      ORDER BY lm.created_at DESC
    `;
    res.json({ conversations });
  });

  v1.get('/messages/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const otherUserId = Number(req.params.userId);
    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    // Mark messages as read first, then fetch (so read_at is populated in response)
    await sql`
      UPDATE messages SET read_at = NOW()
      WHERE sender_id = ${otherUserId} AND receiver_id = ${req.userId} AND read_at IS NULL
    `;
    const messages = await sql`
      SELECT * FROM messages
      WHERE (sender_id = ${req.userId} AND receiver_id = ${otherUserId})
         OR (sender_id = ${otherUserId} AND receiver_id = ${req.userId})
      ORDER BY created_at ASC
    `;
    res.json({ messages });
  });

  // Socket.io with JWT authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = verifyToken(token);
      (socket as any).userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId;
    socket.join(String(userId));

    socket.on('send_message', async (data) => {
      try {
        const { receiver_id, content } = data;
        if (!receiver_id || typeof receiver_id !== 'number') return;
        if (!content || typeof content !== 'string' || content.trim().length === 0) return;
        if (content.length > 5000) return;
        if (receiver_id === userId) return;

        const [recipient] = await sql`SELECT id FROM users WHERE id = ${receiver_id}`;
        if (!recipient) return;

        const trimmedContent = content.trim();
        const [message] = await sql`
          INSERT INTO messages (sender_id, receiver_id, content) VALUES (${userId}, ${receiver_id}, ${trimmedContent})
          RETURNING *
        `;

        io.to(String(receiver_id)).emit('receive_message', message);
        io.to(String(userId)).emit('receive_message', message);

        // Notify receiver of new message
        const [sender] = await sql`SELECT name FROM users WHERE id = ${userId}`;
        const notification = await createNotification(receiver_id, 'new_message', 'New Message', `${sender.name}: ${trimmedContent.substring(0, 100)}`, { sender_id: userId });
        io.to(String(receiver_id)).emit('notification', notification);

        // Send email notification for new message
        const receiverPrefs = await getPreferences(receiver_id);
        if (receiverPrefs.email_enabled && receiverPrefs.new_message) {
          const [receiverUser] = await sql`SELECT name, email FROM users WHERE id = ${receiver_id}`;
          const msgEmail = buildNewMessageEmail({ recipientName: receiverUser.name, senderName: sender.name, messagePreview: trimmedContent.substring(0, 200) });
          sendEmail({ to: receiverUser.email, ...msgEmail }).catch(() => {});
        }
      } catch {
        // Silently handle — malformed message data
      }
    });
  });

  // --- Notifications ---
  v1.get('/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const notifications = await getUserNotifications(req.userId!, limit, offset);
    const unreadCount = await getUnreadCount(req.userId!);
    res.json({ notifications, unreadCount });
  });

  v1.post('/notifications/:id/read', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const success = await markAsRead(Number(req.params.id), req.userId!);
    if (!success) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ success: true });
  });

  v1.post('/notifications/read-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const count = await markAllAsRead(req.userId!);
    res.json({ markedRead: count });
  });

  v1.get('/notification-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const prefs = await getPreferences(req.userId!);
    res.json({ preferences: prefs });
  });

  v1.put('/notification-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { new_booking, booking_status, new_message, walk_updates } = req.body;
    const prefs = await updatePreferences(req.userId!, { new_booking, booking_status, new_message, walk_updates });
    res.json({ preferences: prefs });
  });

  // --- Stripe Connect ---
  // --- Payments (direct — no Stripe Connect) ---
  v1.post('/payments/create-intent', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      if (!booking_id) {
        res.status(400).json({ error: 'booking_id is required' });
        return;
      }
      const [booking] = await sql`SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.payment_intent_id) {
        res.status(409).json({ error: 'Payment already initiated for this booking' });
        return;
      }
      const amountCents = Math.round(booking.total_price * 100);
      if (amountCents <= 0) {
        res.status(400).json({ error: 'No payment required for free bookings' });
        return;
      }
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amountCents);
      await sql`UPDATE bookings SET payment_intent_id = ${paymentIntentId}, payment_status = 'held' WHERE id = ${booking_id}`;
      res.json({ clientSecret, paymentIntentId });
    } catch (error) {
      console.error('Payment intent error:', error);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  v1.post('/payments/capture', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND (owner_id = ${req.userId} OR sitter_id = ${req.userId}) AND payment_status = 'held'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await capturePayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${booking_id}`;
      res.json({ success: true });
    } catch (error) {
      console.error('Payment capture error:', error);
      res.status(500).json({ error: 'Failed to capture payment' });
    }
  });

  v1.post('/payments/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId} AND payment_status = 'held'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await cancelPayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'cancelled', status = 'cancelled' WHERE id = ${booking_id}`;
      res.json({ success: true });
    } catch (error) {
      console.error('Payment cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  });

  // --- Payouts ---
  v1.get('/payouts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can view payouts' });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const payouts = await getPayoutsForSitter(req.userId!, limit, offset);
    res.json({ payouts });
  });

  v1.get('/payouts/pending', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can view payouts' });
      return;
    }
    const payouts = await getPendingPayoutsForSitter(req.userId!);
    res.json({ payouts });
  });

  // --- Stripe Webhook ---
  v1.post('/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }
    try {
      const event = constructWebhookEvent(req.body, sig as string);
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as { id: string };
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE payment_intent_id = ${pi.id}`;
          break;
        }
        case 'payment_intent.canceled': {
          const pi = event.data.object as { id: string };
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE payment_intent_id = ${pi.id}`;
          break;
        }
        case 'checkout.session.completed': {
          const session = event.data.object as {
            mode: string;
            subscription: string;
            metadata: { petlink_user_id?: string };
          };
          if (session.mode === 'subscription' && session.metadata?.petlink_user_id) {
            const userId = Number(session.metadata.petlink_user_id);
            const stripeSubId = session.subscription;
            const [existing] = await sql`SELECT id FROM sitter_subscriptions WHERE sitter_id = ${userId}`;
            if (existing) {
              await sql.begin(async (tx: any) => {
                await tx`
                  UPDATE sitter_subscriptions SET tier = 'pro', status = 'active',
                    stripe_subscription_id = ${stripeSubId},
                    current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
                  WHERE sitter_id = ${userId}
                `;
                await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${userId}`;
              });
            } else {
              await sql.begin(async (tx: any) => {
                await tx`
                  INSERT INTO sitter_subscriptions (sitter_id, tier, status, stripe_subscription_id, current_period_start, current_period_end)
                  VALUES (${userId}, 'pro', 'active', ${stripeSubId}, NOW(), NOW() + INTERVAL '30 days')
                `;
                await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${userId}`;
              });
            }
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as { id: string };
          const [existing] = await sql`SELECT sitter_id FROM sitter_subscriptions WHERE stripe_subscription_id = ${sub.id}`;
          if (existing) {
            await sql.begin(async (tx: any) => {
              await tx`
                UPDATE sitter_subscriptions SET status = 'cancelled', tier = 'free', updated_at = NOW()
                WHERE stripe_subscription_id = ${sub.id}
              `;
              await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${existing.sitter_id}`;
            });
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as unknown as { subscription: string };
          if (invoice.subscription) {
            await sql`
              UPDATE sitter_subscriptions SET status = 'past_due', updated_at = NOW()
              WHERE stripe_subscription_id = ${invoice.subscription}
            `;
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ error: 'Webhook verification failed' });
    }
  });

  // --- Media Upload (S3 signed URLs) ---
  v1.post('/uploads/signed-url', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { folder, contentType, fileSize } = req.body;
      const validFolders = ['pets', 'avatars', 'verifications', 'walks', 'sitter-photos', 'videos'] as const;
      if (!folder || !validFolders.includes(folder)) {
        res.status(400).json({ error: 'folder must be one of: pets, avatars, verifications, walks, sitter-photos, videos' });
        return;
      }
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
      const allowedContentTypes = [...allowedImageTypes, ...allowedVideoTypes];
      if (!contentType || !allowedContentTypes.includes(contentType)) {
        res.status(400).json({ error: 'contentType must be one of: image/jpeg, image/png, image/webp, image/gif, video/mp4, video/quicktime, video/webm' });
        return;
      }
      const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB
      if (folder === 'videos' && typeof fileSize === 'number' && fileSize > MAX_VIDEO_SIZE) {
        res.status(400).json({ error: 'Video file must be under 10MB' });
        return;
      }
      const result = await generateUploadUrl(folder, contentType, req.userId!);
      res.json(result);
    } catch (error) {
      console.error('Upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL. Is S3 configured?' });
    }
  });

  // --- Sitter Analytics ---
  v1.get('/analytics/overview', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    const dateRange = analyticsDateRangeSchema.safeParse(req.query);
    if (!dateRange.success) {
      res.status(400).json({ error: dateRange.error.issues[0].message });
      return;
    }
    const { start, end } = dateRange.data;
    if (start && end) {
      const result = await getOverview(req.userId!, { startDate: start, endDate: end });
      res.json(result);
      return;
    }
    const yearResult = validateYear(req.query.year);
    if (yearResult.valid === false) {
      res.status(400).json({ error: yearResult.error });
      return;
    }
    const result = await getOverview(req.userId!, { year: yearResult.year });
    res.json(result);
  });

  v1.get('/analytics/clients', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const dateRange = analyticsDateRangeSchema.safeParse(req.query);
    const { start, end } = dateRange.success ? dateRange.data : { start: undefined, end: undefined };
    const clients = await getClients(req.userId!, limit, offset, start, end);
    res.json({ clients });
  });

  v1.get('/analytics/clients/:clientId', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    const clientId = Number(req.params.clientId);
    if (!clientId || isNaN(clientId)) {
      res.status(400).json({ error: 'Invalid client ID' });
      return;
    }
    const result = await getClientDetail(req.userId!, clientId);
    if (!result) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (result.bookings.length === 0) {
      res.status(404).json({ error: 'No bookings found with this client' });
      return;
    }
    res.json(result);
  });

  v1.get('/analytics/revenue', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    const dateRange = analyticsDateRangeSchema.safeParse(req.query);
    const { start, end } = dateRange.success ? dateRange.data : { start: undefined, end: undefined };
    const period = validateRevenuePeriod(req.query.period);
    if (start && end) {
      const result = await getRevenue(req.userId!, period, { startDate: start, endDate: end });
      res.json(result);
      return;
    }
    const yearResult = validateYear(req.query.year);
    if (yearResult.valid === false) {
      res.status(400).json({ error: yearResult.error });
      return;
    }
    const result = await getRevenue(req.userId!, period, { year: yearResult.year });
    res.json(result);
  });

  // --- Admin: Sitter Approval ---
  v1.get('/admin/pending-sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const sitters = await sql`
      SELECT id, email, name, role, bio, avatar_url, created_at, approval_status,
             years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description,
             accepted_species, skills
      FROM users
      WHERE approval_status = 'pending_approval' AND role IN ('sitter', 'both')
      ORDER BY created_at ASC
    `;
    res.json({ sitters });
  });

  v1.get('/admin/sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const validStatuses = ['approved', 'pending_approval', 'rejected', 'banned'];
    const statusFilter = status && validStatuses.includes(status) ? status : undefined;

    const sitters = await sql`
      SELECT id, email, name, role, bio, avatar_url, created_at, approval_status, approved_at, approval_rejected_reason,
             years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description,
             accepted_species, skills
      FROM users
      WHERE role IN ('sitter', 'both')
      ${statusFilter ? sql`AND approval_status = ${statusFilter}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [{ total }] = await sql`
      SELECT count(*)::int as total FROM users
      WHERE role IN ('sitter', 'both')
      ${statusFilter ? sql`AND approval_status = ${statusFilter}` : sql``}
    `;
    res.json({ sitters, total });
  });

  v1.put('/admin/sitters/:id/approval', adminMiddleware, validate(approvalDecisionSchema), async (req: AuthenticatedRequest, res) => {
    const sitterId = Number(req.params.id);
    if (!sitterId || isNaN(sitterId)) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    const { status, reason } = req.body;

    if (sitterId === req.userId && (status === 'banned' || status === 'rejected')) {
      res.status(400).json({ error: 'Cannot ban or reject yourself' });
      return;
    }

    const [sitter] = await sql`SELECT id, email, name, role, approval_status FROM users WHERE id = ${sitterId} AND role IN ('sitter', 'both')`;
    if (!sitter) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }

    if (status === 'approved') {
      await sql`
        UPDATE users SET approval_status = 'approved', approved_by = ${req.userId}, approved_at = NOW(), approval_rejected_reason = NULL
        WHERE id = ${sitterId}
      `;
    } else if (status === 'banned') {
      await sql`
        UPDATE users SET approval_status = 'banned', approval_rejected_reason = ${reason || 'Banned by admin'}, approved_by = ${req.userId}, approved_at = NOW()
        WHERE id = ${sitterId}
      `;
    } else {
      await sql`
        UPDATE users SET approval_status = 'rejected', approval_rejected_reason = ${reason || null}, approved_by = ${req.userId}, approved_at = NOW()
        WHERE id = ${sitterId}
      `;
    }

    // Send email notification
    const email = buildApprovalStatusEmail({
      sitterName: sitter.name,
      status,
      reason,
    });
    await sendEmail({ to: sitter.email, ...email }).catch(() => {});

    const [updated] = await sql`
      SELECT id, email, name, role, approval_status, approved_at, approval_rejected_reason
      FROM users WHERE id = ${sitterId}
    `;
    res.json({ sitter: updated });
  });

  // --- Payment Management ---
  v1.get('/payment-methods', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ payment_methods: [] });
        return;
      }
      const methods = await listPaymentMethods(user.stripe_customer_id);
      res.json({ payment_methods: methods });
    } catch (error) {
      console.error('Payment methods error:', error);
      res.status(500).json({ error: 'Failed to load payment methods' });
    }
  });

  v1.delete('/payment-methods/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.params.id || !/^pm_/.test(req.params.id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.status(404).json({ error: 'No payment methods found' });
        return;
      }
      // Verify ownership by retrieving the specific payment method
      const methods = await listPaymentMethods(user.stripe_customer_id);
      const owns = methods.some((m) => m.id === req.params.id);
      if (!owns) {
        res.status(404).json({ error: 'Payment method not found' });
        return;
      }
      await detachPaymentMethod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete payment method error:', error);
      res.status(500).json({ error: 'Failed to remove payment method' });
    }
  });

  v1.get('/payment-history', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ payments: [] });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const payments = await listCharges(user.stripe_customer_id, limit);
      res.json({ payments });
    } catch (error) {
      console.error('Payment history error:', error);
      res.status(500).json({ error: 'Failed to load payment history' });
    }
  });

  // --- ACH Bank Transfer Payment ---
  v1.post('/payments/link-bank', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT email, stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user.stripe_customer_id) {
        res.status(503).json({ error: 'Bank linking requires Stripe Customer setup. Please make a card payment first.' });
        return;
      }
      const result = await createFinancialConnectionsSession(user.stripe_customer_id);
      res.json(result);
    } catch (error) {
      console.error('Bank linking error:', error);
      res.status(500).json({ error: 'Failed to start bank linking' });
    }
  });

  v1.get('/payments/bank-accounts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ bank_accounts: [] });
        return;
      }
      const accounts = await listBankAccounts(user.stripe_customer_id);
      res.json({ bank_accounts: accounts });
    } catch (error) {
      console.error('Bank accounts error:', error);
      res.status(500).json({ error: 'Failed to load bank accounts' });
    }
  });

  v1.delete('/payments/bank-accounts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.params.id || !/^pm_/.test(req.params.id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.status(404).json({ error: 'No bank accounts found' });
        return;
      }
      const accounts = await listBankAccounts(user.stripe_customer_id);
      const owns = accounts.some((a) => a.id === req.params.id);
      if (!owns) {
        res.status(404).json({ error: 'Bank account not found' });
        return;
      }
      await detachBankAccount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Bank account deletion error:', error);
      res.status(500).json({ error: 'Failed to remove bank account' });
    }
  });

  // --- Profile Import ---
  // Import endpoints are rate-limited by the global apiLimiter (100/15min)
  // plus auth required — scraping abuse is bounded by authenticated user rate

  v1.post('/import/preview', authMiddleware, validate(importPreviewSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can import profiles' });
      return;
    }
    const { url } = req.body;
    const parsed = parseRoverUrl(url);
    if (!parsed.valid) {
      res.status(400).json({ error: (parsed as { error: string }).error });
      return;
    }
    let profile;
    try {
      profile = await scrapeRoverProfile(url);
    } catch {
      res.status(502).json({ error: 'Could not reach Rover. Please try again later.' });
      return;
    }
    const { rawHtml: _, ...preview } = profile;
    res.json({ profile: preview });
  });

  v1.post('/import/start-verification', authMiddleware, validate(importPreviewSchema), async (req: AuthenticatedRequest, res) => {
    const { url } = req.body;
    const parsed = parseRoverUrl(url);
    if (!parsed.valid) {
      res.status(400).json({ error: (parsed as { error: string }).error });
      return;
    }
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can import profiles' });
      return;
    }
    let scraped;
    try {
      scraped = await scrapeRoverProfile(url);
    } catch {
      res.status(502).json({ error: 'Could not reach Rover. Please try again later.' });
      return;
    }
    const code = generateVerificationCode('petlink');
    const { rawHtml, ...profileData } = scraped;

    const [profile] = await sql`
      INSERT INTO imported_profiles (sitter_id, platform, profile_url, username, display_name, bio, rating, review_count, verification_code, verification_status, scraped_at, raw_data)
      VALUES (${req.userId}, ${'rover'}, ${url}, ${parsed.username}, ${scraped.name}, ${scraped.bio}, ${scraped.rating}, ${scraped.reviewCount}, ${code}, ${'pending'}, NOW(), ${sql.json(profileData)})
      ON CONFLICT (sitter_id, platform) DO UPDATE SET
        profile_url = EXCLUDED.profile_url, username = EXCLUDED.username, display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio, rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
        verification_code = EXCLUDED.verification_code, verification_status = 'pending',
        scraped_at = NOW(), raw_data = EXCLUDED.raw_data
      RETURNING id, platform, display_name, bio, rating, review_count, verification_code, verification_status
    `;
    res.json({ profile, verification_code: code });
  });

  v1.post('/import/verify', authMiddleware, validate(verifyImportSchema), async (req: AuthenticatedRequest, res) => {
    const { profile_id } = req.body;
    const [profile] = await sql`
      SELECT id, profile_url, verification_code, verification_status, created_at
      FROM imported_profiles WHERE id = ${profile_id} AND sitter_id = ${req.userId}
    `;
    if (!profile) {
      res.status(404).json({ error: 'Import profile not found' });
      return;
    }
    // Check 24h expiry
    const age = Date.now() - new Date(profile.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      await sql`UPDATE imported_profiles SET verification_status = 'failed' WHERE id = ${profile_id}`;
      res.status(410).json({ error: 'Verification code expired. Please start a new import.' });
      return;
    }
    let scraped;
    try {
      scraped = await scrapeRoverProfile(profile.profile_url);
    } catch {
      res.status(502).json({ error: 'Could not reach Rover. Please try again later.' });
      return;
    }
    const found = checkVerificationCode(scraped.rawHtml, profile.verification_code);
    const status = found ? 'verified' : 'failed';
    if (found) {
      await sql`UPDATE imported_profiles SET verification_status = ${status}, verified_at = NOW() WHERE id = ${profile_id}`;
    } else {
      await sql`UPDATE imported_profiles SET verification_status = ${status} WHERE id = ${profile_id}`;
    }
    res.json({ verified: found, status });
  });

  v1.post('/import/confirm', authMiddleware, validate(confirmImportSchema), async (req: AuthenticatedRequest, res) => {
    const { profile_id } = req.body;
    const [profile] = await sql`
      SELECT id, sitter_id, platform, verification_status, raw_data
      FROM imported_profiles WHERE id = ${profile_id} AND sitter_id = ${req.userId}
    `;
    if (!profile) {
      res.status(404).json({ error: 'Import profile not found' });
      return;
    }
    if (profile.verification_status !== 'verified') {
      res.status(400).json({ error: 'Profile must be verified before importing reviews' });
      return;
    }
    // Delete old imported reviews for this profile
    await sql`DELETE FROM imported_reviews WHERE imported_profile_id = ${profile_id}`;
    // Import reviews from raw_data (capped at 100)
    const rawData = profile.raw_data as { reviews?: { reviewerName: string; rating: number; comment: string; date?: string }[] };
    const reviews = (rawData.reviews ?? []).slice(0, 100);
    if (reviews.length > 0) {
      const rows = reviews.map((r) => ({
        imported_profile_id: profile_id,
        sitter_id: req.userId,
        platform: profile.platform,
        reviewer_name: r.reviewerName,
        rating: r.rating,
        comment: r.comment || null,
        review_date: r.date ? (isNaN(new Date(r.date).getTime()) ? null : new Date(r.date).toISOString().slice(0, 10)) : null,
      }));
      await sql`INSERT INTO imported_reviews ${sql(rows, 'imported_profile_id', 'sitter_id', 'platform', 'reviewer_name', 'rating', 'comment', 'review_date')}`;
    }
    // Return scraped profile data so frontend can offer to pre-fill
    const rawProfile = profile.raw_data as { name?: string; bio?: string; rating?: number; reviewCount?: number };
    res.json({
      imported_count: reviews.length,
      scraped_profile: {
        name: rawProfile.name || null,
        bio: rawProfile.bio || null,
        rating: rawProfile.rating || null,
        review_count: rawProfile.reviewCount || null,
      },
    });
  });

  v1.post('/import/apply-profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { profile_id } = req.body;
    if (!profile_id) {
      res.status(400).json({ error: 'profile_id is required' });
      return;
    }
    const [profile] = await sql`
      SELECT id, sitter_id, verification_status, raw_data
      FROM imported_profiles WHERE id = ${profile_id} AND sitter_id = ${req.userId}
    `;
    if (!profile || profile.verification_status !== 'verified') {
      res.status(400).json({ error: 'Profile must be verified first' });
      return;
    }
    const rawData = profile.raw_data as { name?: string; bio?: string };
    // Only update fields that are currently empty on the user's profile
    const [user] = await sql`SELECT name, bio FROM users WHERE id = ${req.userId}`;
    const updates: { bio?: string } = {};
    if (!user.bio && rawData.bio) {
      updates.bio = rawData.bio;
    }
    if (Object.keys(updates).length > 0) {
      await sql`UPDATE users SET bio = COALESCE(${updates.bio || null}, bio) WHERE id = ${req.userId}`;
    }
    const [updated] = await sql`SELECT id, name, bio FROM users WHERE id = ${req.userId}`;
    res.json({ user: updated, fields_updated: Object.keys(updates) });
  });

  v1.get('/import/profiles', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const profiles = await sql`
      SELECT id, platform, profile_url, display_name, rating, review_count, verification_status, verified_at, created_at
      FROM imported_profiles WHERE sitter_id = ${req.userId}
      ORDER BY created_at DESC
    `;
    res.json({ profiles });
  });

  v1.delete('/import/profiles/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [profile] = await sql`SELECT id FROM imported_profiles WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!profile) {
      res.status(404).json({ error: 'Import profile not found' });
      return;
    }
    await sql`DELETE FROM imported_profiles WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });

  // --- Calendar ---
  v1.get('/calendar', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = calendarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
      return;
    }
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can access the calendar' });
      return;
    }
    const events = await getCalendarData(sql, req.userId!, parsed.data.start, parsed.data.end);
    res.json({ events });
  });

  // --- Calendar Export (iCal/ICS) ---
  v1.post('/calendar/token', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const token = await generateCalendarToken(sql, req.userId!);
    const url = `${req.protocol}://${req.get('host')}/api/v1/calendar/export?token=${token}`;
    res.json({ token, url });
  });

  v1.delete('/calendar/token', authMiddleware, async (req: AuthenticatedRequest, res) => {
    await revokeCalendarToken(sql, req.userId!);
    res.json({ success: true });
  });

  v1.get('/calendar/export', publicLimiter, async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const userId = await validateCalendarToken(sql, token);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const [user] = await sql`SELECT name FROM users WHERE id = ${userId}`;
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const bookings = await sql`
      SELECT b.id, b.status, b.start_time, b.end_time,
             svc.type as service_type,
             o.name as owner_name
      FROM bookings b
      LEFT JOIN services svc ON b.service_id = svc.id
      JOIN users o ON b.owner_id = o.id
      WHERE b.sitter_id = ${userId}
        AND b.start_time > NOW() - INTERVAL '3 months'
        AND b.start_time < NOW() + INTERVAL '6 months'
      ORDER BY b.start_time DESC
    `;

    const bookingIds = bookings.map((b: any) => b.id);
    const bookingPets = bookingIds.length > 0
      ? await sql`
          SELECT bp.booking_id, p.name
          FROM booking_pets bp
          JOIN pets p ON bp.pet_id = p.id
          WHERE bp.booking_id IN ${sql(bookingIds)}
        `
      : [];
    const petsByBooking = new Map<number, string[]>();
    for (const row of bookingPets) {
      const existing = petsByBooking.get(row.booking_id) ?? [];
      petsByBooking.set(row.booking_id, [...existing, row.name]);
    }

    const availability = await sql`
      SELECT * FROM availability WHERE sitter_id = ${userId} ORDER BY day_of_week, start_time
    `;

    const icsStatusMap: Record<string, 'confirmed' | 'tentative' | 'cancelled'> = {
      confirmed: 'confirmed', in_progress: 'confirmed', completed: 'confirmed',
      pending: 'tentative', cancelled: 'cancelled',
    };

    const icsEvents: ICSEvent[] = [];

    for (const b of bookings) {
      const petNames = petsByBooking.get(b.id) || [];
      icsEvents.push({
        id: b.id,
        type: 'booking',
        title: `${b.service_type || 'Booking'} - ${b.owner_name || 'Client'}`,
        description: [
          petNames.length > 0 ? `Pets: ${petNames.join(', ')}` : null,
          b.service_type ? `Service: ${b.service_type}` : null,
          b.owner_name ? `Client: ${b.owner_name}` : null,
        ].filter(Boolean).join('\n'),
        start: new Date(b.start_time),
        end: new Date(b.end_time),
        status: icsStatusMap[b.status] || 'confirmed',
        categories: ['BOOKING'],
      });
    }

    for (const a of availability) {
      if (a.specific_date) {
        const d = new Date(a.specific_date);
        const [sh, sm] = (a.start_time as string).split(':').map(Number);
        const [eh, em] = (a.end_time as string).split(':').map(Number);
        icsEvents.push({
          id: a.id, type: 'availability', title: 'Available',
          start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sh, sm || 0)),
          end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), eh, em || 0)),
          status: 'confirmed', categories: ['AVAILABILITY'],
        });
      } else if (a.day_of_week != null) {
        const now = new Date();
        const diff = ((a.day_of_week as number) - now.getUTCDay() + 7) % 7;
        const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
        const [sh, sm] = (a.start_time as string).split(':').map(Number);
        const [eh, em] = (a.end_time as string).split(':').map(Number);
        icsEvents.push({
          id: a.id, type: 'availability', title: 'Available',
          start: new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), sh, sm || 0)),
          end: new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), eh, em || 0)),
          status: 'confirmed', categories: ['AVAILABILITY'],
        });
      }
    }

    const ics = generateICS(icsEvents, user.name);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="petlink-calendar.ics"');
    res.send(ics);
  });

  // Mount versioned API router at /api/v1 (canonical) and /api (backwards compat)
  app.use('/api/v1', v1);
  app.use('/api', v1);

  // Global error handler — catches unhandled errors from async route handlers
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unhandled route error:', message);
    }
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
