import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { initDb } from './src/db.ts';
import sql from './src/db.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, authMiddleware, type AuthenticatedRequest } from './src/auth.ts';
import { createConnectedAccount, createAccountLink, createPaymentIntent, capturePayment, cancelPayment, constructWebhookEvent } from './src/payments.ts';
import { createNotification, getUserNotifications, getUnreadCount, markAsRead, markAllAsRead, getPreferences, updatePreferences } from './src/notifications.ts';
import { generateUploadUrl } from './src/storage.ts';
import { validate, signupSchema, loginSchema, updateProfileSchema, petSchema, serviceSchema, createBookingSchema, updateBookingStatusSchema, createReviewSchema, createSitterPhotoSchema, updateSitterPhotoSchema } from './src/validation.ts';
import { sendEmail, buildBookingConfirmationEmail, buildBookingStatusEmail, buildNewMessageEmail, buildSitterNewBookingEmail } from './src/email.ts';
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
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://i.pravatar.cc", "https://ui-avatars.com"],
            connectSrc: ["'self'", "wss:", "https://api.stripe.com", "https://nominatim.openstreetmap.org"],
            frameSrc: ["https://js.stripe.com"],
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
  const PORT = 3000;

  // Raw body needed for Stripe webhook signature verification
  app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(cookieParser());

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again later' },
  });

  // Health check (before rate limiting, no auth)
  app.get('/api/v1/health', async (_req, res) => {
    try {
      await sql`SELECT 1`;
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database unreachable' });
    }
  });

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
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (${email}, ${passwordHash}, ${name}, ${role})
      RETURNING id, email, name, role, bio, avatar_url, lat, lng
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

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({ userId: user.id });
    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  v1.get('/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`
      SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ${req.userId}
    `;
    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: 'User not found' });
    }
  });

  // --- Users ---
  v1.put('/users/me', authMiddleware, validate(updateProfileSchema), async (req: AuthenticatedRequest, res) => {
    const { name, bio, avatar_url, role } = req.body;

    await sql`
      UPDATE users SET name = ${name}, bio = ${bio || null}, avatar_url = ${avatar_url || null},
      role = COALESCE(${role || null}::user_role, role)
      WHERE id = ${req.userId}
    `;

    const [user] = await sql`
      SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ${req.userId}
    `;

    res.json({ user });
  });

  // --- Pets ---
  v1.get('/pets', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const pets = await sql`SELECT * FROM pets WHERE owner_id = ${req.userId}`;
    res.json({ pets });
  });

  v1.post('/pets', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    const { name, breed, age, weight, medical_history, photo_url } = req.body;
    const [pet] = await sql`
      INSERT INTO pets (owner_id, name, breed, age, weight, medical_history, photo_url)
      VALUES (${req.userId}, ${name}, ${breed || null}, ${age || null}, ${weight || null}, ${medical_history || null}, ${photo_url || null})
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
    const { name, breed, age, weight, medical_history, photo_url } = req.body;
    const [updated] = await sql`
      UPDATE pets SET name = ${name}, breed = ${breed || null}, age = ${age || null},
      weight = ${weight || null}, medical_history = ${medical_history || null}, photo_url = ${photo_url || null}
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

  // --- Sitters ---
  v1.get('/sitters', async (req, res) => {
    const serviceType = req.query.serviceType as string | undefined;
    const lat = req.query.lat as string | undefined;
    const lng = req.query.lng as string | undefined;
    const radius = req.query.radius as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    const petSize = req.query.petSize as string | undefined;

    const hasGeo = lat && lng && radius;
    const geoPoint = hasGeo ? sql`ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography` : sql``;

    const sitters = await sql`
      SELECT u.id, u.email, u.name, u.role, u.bio, u.avatar_url, u.lat, u.lng,
             u.accepted_pet_sizes,
             s.price, s.type as service_type
             ${hasGeo ? sql`, ST_Distance(u.location, ${geoPoint}) as distance_meters` : sql``}
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      WHERE u.role IN ('sitter', 'both')
        ${serviceType ? sql`AND s.type = ${serviceType}` : sql``}
        ${minPrice ? sql`AND s.price >= ${Number(minPrice)}` : sql``}
        ${maxPrice ? sql`AND s.price <= ${Number(maxPrice)}` : sql``}
        ${petSize ? sql`AND ${petSize} = ANY(u.accepted_pet_sizes)` : sql``}
        ${hasGeo ? sql`AND ST_DWithin(u.location, ${geoPoint}, ${Number(radius)})` : sql``}
      ${hasGeo ? sql`ORDER BY distance_meters` : sql``}
    `;

    res.json({ sitters });
  });

  v1.get('/sitters/:id', async (req, res) => {
    const [sitter] = await sql`
      SELECT id, email, name, role, bio, avatar_url, lat, lng, accepted_pet_sizes FROM users WHERE id = ${req.params.id}
    `;
    if (!sitter) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }

    const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.params.id}`;
    const reviews = await sql`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ${req.params.id}
    `;

    const photos = await sql`SELECT * FROM sitter_photos WHERE sitter_id = ${req.params.id} ORDER BY sort_order, created_at`;

    res.json({ sitter, services, reviews, photos });
  });

  // --- Services (sitter CRUD) ---
  v1.get('/services/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.userId}`;
    res.json({ services });
  });

  v1.post('/services', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    const { type, price, description } = req.body;
    const [existing] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type}`;
    if (existing) {
      res.status(409).json({ error: `You already have a ${type} service. Edit it instead.` });
      return;
    }
    const [service] = await sql`
      INSERT INTO services (sitter_id, type, price, description)
      VALUES (${req.userId}, ${type}, ${price}, ${description || null})
      RETURNING *
    `;
    res.status(201).json({ service });
  });

  v1.put('/services/:id', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const { type, price, description } = req.body;
    const [updated] = await sql`
      UPDATE services SET type = ${type}, price = ${price}, description = ${description || null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ service: updated });
  });

  v1.delete('/services/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
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

    const [review] = await sql`
      INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment)
      VALUES (${booking_id}, ${req.userId}, ${revieweeId}, ${rating}, ${comment || null})
      RETURNING id
    `;

    // Check if both parties have reviewed — if so, publish both
    const [otherReview] = await sql`SELECT id FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${revieweeId}`;

    if (otherReview) {
      await sql`UPDATE reviews SET published_at = NOW() WHERE booking_id = ${booking_id} AND published_at IS NULL`;
    }

    res.status(201).json({ id: review.id });
  });

  // Get reviews for a user (only published ones)
  v1.get('/reviews/:userId', async (req, res) => {
    const reviews = await sql`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ${req.params.userId} AND r.published_at IS NOT NULL
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
    const [user] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can start verification' });
      return;
    }

    const [existing] = await sql`SELECT id FROM verifications WHERE sitter_id = ${req.userId}`;
    if (existing) {
      res.status(409).json({ error: 'Verification already started' });
      return;
    }

    const [verification] = await sql`
      INSERT INTO verifications (sitter_id, submitted_at) VALUES (${req.userId}, NOW())
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

  // Webhook endpoint for background check results
  v1.post('/webhooks/background-check', async (req, res) => {
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
  v1.get('/verification/:sitterId', async (req, res) => {
    const [verification] = await sql`
      SELECT id_check_status, background_check_status, completed_at FROM verifications WHERE sitter_id = ${req.params.sitterId}
    `;
    res.json({ verification: verification || null });
  });

  // --- Availability ---
  v1.get('/availability/:sitterId', async (req, res) => {
    const slots = await sql`
      SELECT * FROM availability WHERE sitter_id = ${req.params.sitterId} ORDER BY day_of_week, start_time
    `;
    res.json({ slots });
  });

  v1.post('/availability', authMiddleware, async (req: AuthenticatedRequest, res) => {
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
  v1.get('/sitter-photos/:sitterId', async (req, res) => {
    const photos = await sql`
      SELECT * FROM sitter_photos WHERE sitter_id = ${req.params.sitterId} ORDER BY sort_order, created_at
    `;
    res.json({ photos });
  });

  v1.post('/sitter-photos', authMiddleware, validate(createSitterPhotoSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can upload photos' });
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
    const events = await sql`SELECT * FROM walk_events WHERE booking_id = ${req.params.bookingId} ORDER BY created_at ASC`;
    res.json({ events });
  });

  v1.post('/walks/:bookingId/events', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking || booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can log walk events' });
      return;
    }
    const { event_type, lat, lng, note, photo_url } = req.body;
    if (!event_type) {
      res.status(400).json({ error: 'event_type is required' });
      return;
    }
    const [event] = await sql`
      INSERT INTO walk_events (booking_id, event_type, lat, lng, note, photo_url)
      VALUES (${req.params.bookingId}, ${event_type}, ${lat || null}, ${lng || null}, ${note || null}, ${photo_url || null})
      RETURNING *
    `;

    // If event is 'start', update booking to in_progress and notify owner
    if (event_type === 'start') {
      await sql`UPDATE bookings SET status = 'in_progress' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const startNotif = await createNotification(booking.owner_id, 'walk_started', 'Walk Started', `${sitterUser.name} has started the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', startNotif);
    }
    // If event is 'end', update booking to completed and notify owner
    if (event_type === 'end') {
      await sql`UPDATE bookings SET status = 'completed' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const endNotif = await createNotification(booking.owner_id, 'walk_completed', 'Walk Completed', `${sitterUser.name} has completed the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', endNotif);
    }

    res.status(201).json({ event });
  });

  // --- Bookings ---
  v1.post('/bookings', authMiddleware, validate(createBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, start_time, end_time } = req.body;

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
    const [service] = await sql`SELECT id, price, type FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    const [booking] = await sql`
      INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price, status)
      VALUES (${sitter_id}, ${req.userId}, ${service_id}, ${start_time}, ${end_time}, ${service.price}, 'pending')
      RETURNING id, status
    `;

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
      const sitterEmail = buildSitterNewBookingEmail({ sitterName: sitter.name, ownerName: owner.name, serviceName, startTime: formattedStart, totalPrice: service.price });
      sendEmail({ to: sitter.email, ...sitterEmail }).catch(() => {});
    }
    const ownerPrefs = await getPreferences(req.userId!);
    if (ownerPrefs.email_enabled && ownerPrefs.new_booking) {
      const ownerEmail = buildBookingConfirmationEmail({ ownerName: owner.name, sitterName: sitter.name, serviceName, startTime: formattedStart, totalPrice: service.price });
      sendEmail({ to: owner.email, ...ownerEmail }).catch(() => {});
    }

    res.json({ id: booking.id, status: booking.status });
  });

  v1.get('/bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookings = await sql`
      SELECT b.*,
             s.name as sitter_name, s.avatar_url as sitter_avatar,
             o.name as owner_name, o.avatar_url as owner_avatar,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId}
      ORDER BY b.start_time DESC
    `;

    res.json({ bookings });
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
        UPDATE bookings SET status = 'confirmed'::booking_status
        WHERE id = ${bookingId} AND sitter_id = ${req.userId} AND status = 'pending'
        RETURNING *
      `;
    } else {
      // Cancelled — sitter can cancel pending, owner can cancel pending or confirmed
      [updated] = await sql`
        UPDATE bookings SET status = 'cancelled'::booking_status
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

    res.json({ booking: updated });
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
  v1.post('/stripe/connect', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT email, role, stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (user.role !== 'sitter' && user.role !== 'both') {
        res.status(403).json({ error: 'Only sitters can connect a Stripe account' });
        return;
      }
      if (user.stripe_account_id) {
        res.status(409).json({ error: 'Stripe account already connected' });
        return;
      }
      const accountId = await createConnectedAccount(user.email);
      await sql`UPDATE users SET stripe_account_id = ${accountId} WHERE id = ${req.userId}`;
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const url = await createAccountLink(accountId, appUrl);
      res.json({ accountId, onboardingUrl: url });
    } catch (error) {
      console.error('Stripe connect error:', error);
      res.status(500).json({ error: 'Failed to create Stripe account' });
    }
  });

  v1.post('/stripe/account-link', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (!user.stripe_account_id) {
        res.status(400).json({ error: 'No Stripe account connected' });
        return;
      }
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const url = await createAccountLink(user.stripe_account_id, appUrl);
      res.json({ onboardingUrl: url });
    } catch (error) {
      console.error('Stripe account link error:', error);
      res.status(500).json({ error: 'Failed to create account link' });
    }
  });

  // --- Payments ---
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
      const [sitter] = await sql`SELECT stripe_account_id FROM users WHERE id = ${booking.sitter_id}`;
      if (!sitter.stripe_account_id) {
        res.status(400).json({ error: 'Sitter has not connected a Stripe account' });
        return;
      }
      const amountCents = Math.round(booking.total_price * 100);
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amountCents, sitter.stripe_account_id);
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
      const { folder, contentType } = req.body;
      const validFolders = ['pets', 'avatars', 'verifications', 'walks'] as const;
      if (!folder || !validFolders.includes(folder)) {
        res.status(400).json({ error: 'folder must be one of: pets, avatars, verifications, walks' });
        return;
      }
      const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!contentType || !allowedContentTypes.includes(contentType)) {
        res.status(400).json({ error: 'contentType must be one of: image/jpeg, image/png, image/webp, image/gif' });
        return;
      }
      const result = await generateUploadUrl(folder, contentType, req.userId!);
      res.json(result);
    } catch (error) {
      console.error('Upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL. Is S3 configured?' });
    }
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
