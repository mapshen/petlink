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
