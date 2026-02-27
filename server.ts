import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { initDb } from './src/db.ts';
import db from './src/db.ts';
import { hashPassword, verifyPassword, signToken, verifyToken, authMiddleware, type AuthenticatedRequest } from './src/auth.ts';
import { createConnectedAccount, createAccountLink, createPaymentIntent, capturePayment, cancelPayment, constructWebhookEvent } from './src/payments.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB
initDb();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  // Raw body needed for Stripe webhook signature verification
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(cookieParser());

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
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

  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);

  // API Routes

  // --- Auth ---
  app.post('/api/auth/signup', (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const validRoles = ['owner', 'sitter', 'both'];
    const userRole = validRoles.includes(role) ? role : 'owner';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = hashPassword(password);
    const stmt = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(email, passwordHash, name, userRole);
    const user = db.prepare('SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = signToken({ userId: Number(info.lastInsertRowid) });

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined;
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!verifyPassword(password, user.password_hash as string)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({ userId: user.id as number });
    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
    const user = db.prepare(
      'SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ?'
    ).get(req.userId);
    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: 'User not found' });
    }
  });

  // --- Users ---
  app.put('/api/users/me', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { name, bio, avatar_url, role } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const validRoles = ['owner', 'sitter', 'both'];
    const userRole = validRoles.includes(role) ? role : undefined;

    db.prepare(
      'UPDATE users SET name = ?, bio = ?, avatar_url = ?, role = COALESCE(?, role) WHERE id = ?'
    ).run(name, bio || null, avatar_url || null, userRole, req.userId);

    const user = db.prepare(
      'SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ?'
    ).get(req.userId);

    res.json({ user });
  });

  // --- Pets ---
  app.get('/api/pets', authMiddleware, (req: AuthenticatedRequest, res) => {
    const pets = db.prepare('SELECT * FROM pets WHERE owner_id = ?').all(req.userId);
    res.json({ pets });
  });

  app.post('/api/pets', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { name, breed, age, weight, medical_history, photo_url } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Pet name is required' });
      return;
    }
    const info = db.prepare(
      'INSERT INTO pets (owner_id, name, breed, age, weight, medical_history, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.userId, name, breed || null, age || null, weight || null, medical_history || null, photo_url || null);
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ pet });
  });

  app.put('/api/pets/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId);
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const { name, breed, age, weight, medical_history, photo_url } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Pet name is required' });
      return;
    }
    db.prepare(
      'UPDATE pets SET name = ?, breed = ?, age = ?, weight = ?, medical_history = ?, photo_url = ? WHERE id = ? AND owner_id = ?'
    ).run(name, breed || null, age || null, weight || null, medical_history || null, photo_url || null, req.params.id, req.userId);
    const updated = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    res.json({ pet: updated });
  });

  app.delete('/api/pets/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId);
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    db.prepare('DELETE FROM pets WHERE id = ? AND owner_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  });

  // --- Sitters ---
  app.get('/api/sitters', (req, res) => {
    const { serviceType } = req.query;
    let query = `
      SELECT u.id, u.email, u.name, u.role, u.bio, u.avatar_url, u.lat, u.lng,
             s.price, s.type as service_type
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      WHERE u.role IN ('sitter', 'both')
    `;
    const params: unknown[] = [];

    if (serviceType) {
      query += ` AND s.type = ?`;
      params.push(serviceType);
    }

    const sitters = db.prepare(query).all(...params);
    res.json({ sitters });
  });

  app.get('/api/sitters/:id', (req, res) => {
    const sitter = db.prepare(
      'SELECT id, email, name, role, bio, avatar_url, lat, lng FROM users WHERE id = ?'
    ).get(req.params.id);
    if (!sitter) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }

    const services = db.prepare('SELECT * FROM services WHERE sitter_id = ?').all(req.params.id);
    const reviews = db.prepare(`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ?
    `).all(req.params.id);

    res.json({ sitter, services, reviews });
  });

  // --- Reviews (double-blind) ---
  app.post('/api/reviews', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { booking_id, rating, comment } = req.body;

    if (!booking_id || !rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'booking_id and rating (1-5) are required' });
      return;
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id) as Record<string, unknown> | undefined;
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

    // Check for duplicate
    const existing = db.prepare('SELECT id FROM reviews WHERE booking_id = ? AND reviewer_id = ?').get(booking_id, req.userId);
    if (existing) {
      res.status(409).json({ error: 'You have already reviewed this booking' });
      return;
    }

    const info = db.prepare(
      'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).run(booking_id, req.userId, revieweeId, rating, comment || null);

    // Check if both parties have reviewed — if so, publish both
    const otherReview = db.prepare(
      'SELECT id FROM reviews WHERE booking_id = ? AND reviewer_id = ?'
    ).get(booking_id, revieweeId);

    if (otherReview) {
      const now = new Date().toISOString();
      db.prepare('UPDATE reviews SET published_at = ? WHERE booking_id = ? AND published_at IS NULL').run(now, booking_id);
    }

    res.status(201).json({ id: info.lastInsertRowid });
  });

  // Get reviews for a user (only published ones)
  app.get('/api/reviews/:userId', (req, res) => {
    const reviews = db.prepare(`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ? AND r.published_at IS NOT NULL
      ORDER BY r.created_at DESC
    `).all(req.params.userId);

    res.json({ reviews });
  });

  // --- Sitter Verification ---
  app.get('/api/verification/me', authMiddleware, (req: AuthenticatedRequest, res) => {
    const verification = db.prepare('SELECT * FROM verifications WHERE sitter_id = ?').get(req.userId);
    res.json({ verification: verification || null });
  });

  app.post('/api/verification/start', authMiddleware, (req: AuthenticatedRequest, res) => {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId) as Record<string, unknown>;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can start verification' });
      return;
    }

    const existing = db.prepare('SELECT id FROM verifications WHERE sitter_id = ?').get(req.userId);
    if (existing) {
      res.status(409).json({ error: 'Verification already started' });
      return;
    }

    const info = db.prepare(
      'INSERT INTO verifications (sitter_id, submitted_at) VALUES (?, ?)'
    ).run(req.userId, new Date().toISOString());
    const verification = db.prepare('SELECT * FROM verifications WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ verification });
  });

  app.put('/api/verification/update', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { house_photos_url } = req.body;
    const verification = db.prepare('SELECT * FROM verifications WHERE sitter_id = ?').get(req.userId);
    if (!verification) {
      res.status(404).json({ error: 'No verification found. Start verification first.' });
      return;
    }
    db.prepare('UPDATE verifications SET house_photos_url = ? WHERE sitter_id = ?').run(house_photos_url, req.userId);
    const updated = db.prepare('SELECT * FROM verifications WHERE sitter_id = ?').get(req.userId);
    res.json({ verification: updated });
  });

  // Webhook endpoint for background check results (called by external provider)
  app.post('/api/webhooks/background-check', (req, res) => {
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

    const verification = db.prepare('SELECT * FROM verifications WHERE sitter_id = ?').get(sitter_id);
    if (!verification) {
      res.status(404).json({ error: 'Verification not found' });
      return;
    }

    db.prepare('UPDATE verifications SET background_check_status = ? WHERE sitter_id = ?').run(status, sitter_id);

    // If background check passed and ID is approved, mark as completed
    const updated = db.prepare('SELECT * FROM verifications WHERE sitter_id = ?').get(sitter_id) as Record<string, unknown>;
    if (updated.background_check_status === 'passed' && updated.id_check_status === 'approved') {
      db.prepare('UPDATE verifications SET completed_at = ? WHERE sitter_id = ?').run(new Date().toISOString(), sitter_id);
    }

    res.json({ success: true });
  });

  // Get verification status for a sitter (public, for profile display)
  app.get('/api/verification/:sitterId', (req, res) => {
    const verification = db.prepare('SELECT id_check_status, background_check_status, completed_at FROM verifications WHERE sitter_id = ?').get(req.params.sitterId);
    res.json({ verification: verification || null });
  });

  // --- Availability ---
  app.get('/api/availability/:sitterId', (req, res) => {
    const slots = db.prepare('SELECT * FROM availability WHERE sitter_id = ? ORDER BY day_of_week, start_time').all(req.params.sitterId);
    res.json({ slots });
  });

  app.post('/api/availability', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { day_of_week, specific_date, start_time, end_time, recurring } = req.body;
    if (start_time == null || end_time == null) {
      res.status(400).json({ error: 'start_time and end_time are required' });
      return;
    }
    const info = db.prepare(
      'INSERT INTO availability (sitter_id, day_of_week, specific_date, start_time, end_time, recurring) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, day_of_week ?? null, specific_date || null, start_time, end_time, recurring ? 1 : 0);
    const slot = db.prepare('SELECT * FROM availability WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ slot });
  });

  app.delete('/api/availability/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND sitter_id = ?').get(req.params.id, req.userId);
    if (!slot) {
      res.status(404).json({ error: 'Availability slot not found' });
      return;
    }
    db.prepare('DELETE FROM availability WHERE id = ? AND sitter_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  });

  // --- Walk Events ---
  app.get('/api/walks/:bookingId/events', authMiddleware, (req: AuthenticatedRequest, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.bookingId) as Record<string, unknown> | undefined;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }
    const events = db.prepare('SELECT * FROM walk_events WHERE booking_id = ? ORDER BY created_at ASC').all(req.params.bookingId);
    res.json({ events });
  });

  app.post('/api/walks/:bookingId/events', authMiddleware, (req: AuthenticatedRequest, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.bookingId) as Record<string, unknown> | undefined;
    if (!booking || booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can log walk events' });
      return;
    }
    const { event_type, lat, lng, note, photo_url } = req.body;
    if (!event_type) {
      res.status(400).json({ error: 'event_type is required' });
      return;
    }
    const info = db.prepare(
      'INSERT INTO walk_events (booking_id, event_type, lat, lng, note, photo_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.params.bookingId, event_type, lat || null, lng || null, note || null, photo_url || null);

    // If event is 'start', update booking to in_progress
    if (event_type === 'start') {
      db.prepare("UPDATE bookings SET status = 'in_progress' WHERE id = ?").run(req.params.bookingId);
    }
    // If event is 'end', update booking to completed
    if (event_type === 'end') {
      db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(req.params.bookingId);
    }

    const event = db.prepare('SELECT * FROM walk_events WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ event });
  });

  // --- Bookings ---
  app.post('/api/bookings', authMiddleware, (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, start_time, end_time, total_price } = req.body;
    const stmt = db.prepare(`
      INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);
    const info = stmt.run(sitter_id, req.userId, service_id, start_time, end_time, total_price);
    res.json({ id: info.lastInsertRowid, status: 'pending' });
  });

  app.get('/api/bookings', authMiddleware, (req: AuthenticatedRequest, res) => {
    const bookings = db.prepare(`
      SELECT b.*,
             s.name as sitter_name, s.avatar_url as sitter_avatar,
             o.name as owner_name, o.avatar_url as owner_avatar,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE b.owner_id = ? OR b.sitter_id = ?
      ORDER BY b.start_time DESC
    `).all(req.userId, req.userId);

    res.json({ bookings });
  });

  // --- Messages ---
  app.get('/api/messages/:userId', authMiddleware, (req: AuthenticatedRequest, res) => {
    const otherUserId = req.params.userId;

    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = ? AND receiver_id = ?)
         OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
    `).all(req.userId, otherUserId, otherUserId, req.userId);

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

    socket.on('send_message', (data) => {
      const { receiver_id, content } = data;

      const stmt = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)');
      const info = stmt.run(userId, receiver_id, content);

      const message = {
        id: info.lastInsertRowid,
        sender_id: userId,
        receiver_id,
        content,
        created_at: new Date().toISOString()
      };

      io.to(String(receiver_id)).emit('receive_message', message);
      io.to(String(userId)).emit('receive_message', message);
    });
  });


  // --- Stripe Connect ---
  app.post('/api/stripe/connect', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const user = db.prepare('SELECT email, role, stripe_account_id FROM users WHERE id = ?').get(req.userId) as Record<string, unknown>;
      if (user.role !== 'sitter' && user.role !== 'both') {
        res.status(403).json({ error: 'Only sitters can connect a Stripe account' });
        return;
      }
      if (user.stripe_account_id) {
        res.status(409).json({ error: 'Stripe account already connected' });
        return;
      }
      const accountId = await createConnectedAccount(user.email as string);
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?').run(accountId, req.userId);
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const url = await createAccountLink(accountId, appUrl);
      res.json({ accountId, onboardingUrl: url });
    } catch (error) {
      console.error('Stripe connect error:', error);
      res.status(500).json({ error: 'Failed to create Stripe account' });
    }
  });

  app.post('/api/stripe/account-link', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const user = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(req.userId) as Record<string, unknown>;
      if (!user.stripe_account_id) {
        res.status(400).json({ error: 'No Stripe account connected' });
        return;
      }
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const url = await createAccountLink(user.stripe_account_id as string, appUrl);
      res.json({ onboardingUrl: url });
    } catch (error) {
      console.error('Stripe account link error:', error);
      res.status(500).json({ error: 'Failed to create account link' });
    }
  });

  // --- Payments ---
  app.post('/api/payments/create-intent', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      if (!booking_id) {
        res.status(400).json({ error: 'booking_id is required' });
        return;
      }
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND owner_id = ?').get(booking_id, req.userId) as Record<string, unknown> | undefined;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.payment_intent_id) {
        res.status(409).json({ error: 'Payment already initiated for this booking' });
        return;
      }
      const sitter = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(booking.sitter_id) as Record<string, unknown>;
      if (!sitter.stripe_account_id) {
        res.status(400).json({ error: 'Sitter has not connected a Stripe account' });
        return;
      }
      const amountCents = Math.round((booking.total_price as number) * 100);
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amountCents, sitter.stripe_account_id as string);
      db.prepare("UPDATE bookings SET payment_intent_id = ?, payment_status = 'held' WHERE id = ?").run(paymentIntentId, booking_id);
      res.json({ clientSecret, paymentIntentId });
    } catch (error) {
      console.error('Payment intent error:', error);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  app.post('/api/payments/capture', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const booking = db.prepare(
        "SELECT * FROM bookings WHERE id = ? AND (owner_id = ? OR sitter_id = ?) AND payment_status = 'held'"
      ).get(booking_id, req.userId, req.userId) as Record<string, unknown> | undefined;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await capturePayment(booking.payment_intent_id as string);
      db.prepare("UPDATE bookings SET payment_status = 'captured' WHERE id = ?").run(booking_id);
      res.json({ success: true });
    } catch (error) {
      console.error('Payment capture error:', error);
      res.status(500).json({ error: 'Failed to capture payment' });
    }
  });

  app.post('/api/payments/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const booking = db.prepare(
        "SELECT * FROM bookings WHERE id = ? AND owner_id = ? AND payment_status = 'held'"
      ).get(booking_id, req.userId) as Record<string, unknown> | undefined;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await cancelPayment(booking.payment_intent_id as string);
      db.prepare("UPDATE bookings SET payment_status = 'cancelled', status = 'cancelled' WHERE id = ?").run(booking_id);
      res.json({ success: true });
    } catch (error) {
      console.error('Payment cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  });

  // --- Stripe Webhook ---
  app.post('/api/webhooks/stripe', async (req, res) => {
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
          db.prepare("UPDATE bookings SET payment_status = 'captured' WHERE payment_intent_id = ?").run(pi.id);
          break;
        }
        case 'payment_intent.canceled': {
          const pi = event.data.object as { id: string };
          db.prepare("UPDATE bookings SET payment_status = 'cancelled' WHERE payment_intent_id = ?").run(pi.id);
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ error: 'Webhook verification failed' });
    }
  });

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
