import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDb } from './src/db.ts';
import db from './src/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB
initDb();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all for dev simplicity
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  
  // --- Auth (Mock) ---
  app.post('/api/auth/login', (req, res) => {
    const { email } = req.body;
    // Simple mock login - find user by email
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: 'User not found' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    // In a real app, verify JWT from cookie/header
    // For demo, we'll just return the first user as "logged in" if no auth header
    // But let's try to be a bit better: client sends user ID in header for this demo
    const userId = req.headers['x-user-id'];
    if (userId) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (user) res.json({ user });
      else res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  });

  // --- Sitters ---
  app.get('/api/sitters', (req, res) => {
    const { lat, lng, serviceType } = req.query;
    // Basic query, in real app use PostGIS or Haversine
    let query = `
      SELECT u.*, s.price, s.type as service_type 
      FROM users u 
      JOIN services s ON u.id = s.sitter_id 
      WHERE u.role IN ('sitter', 'both')
    `;
    
    if (serviceType) {
      query += ` AND s.type = '${serviceType}'`;
    }

    const sitters = db.prepare(query).all();
    res.json({ sitters });
  });

  app.get('/api/sitters/:id', (req, res) => {
    const sitter = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!sitter) return res.status(404).json({ error: 'Sitter not found' });
    
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
  app.post('/api/bookings', (req, res) => {
    const { sitter_id, owner_id, service_id, start_time, end_time, total_price } = req.body;
    const stmt = db.prepare(`
      INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);
    const info = stmt.run(sitter_id, owner_id, service_id, start_time, end_time, total_price);
    res.json({ id: info.lastInsertRowid, status: 'pending' });
  });

  app.get('/api/bookings', (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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
    `).all(userId, userId);
    
    res.json({ bookings });
  });

  // --- Messages ---
  app.get('/api/messages/:userId', (req, res) => {
    const currentUserId = req.headers['x-user-id'];
    const otherUserId = req.params.userId;
    
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
    `).all(currentUserId, otherUserId, otherUserId, currentUserId);

    res.json({ messages });
  });

  // Socket.io
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (userId) => {
      socket.join(userId); // Join a room named after the user ID
    });

    socket.on('send_message', (data) => {
      // data: { sender_id, receiver_id, content }
      const { sender_id, receiver_id, content } = data;
      
      // Save to DB
      const stmt = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)');
      const info = stmt.run(sender_id, receiver_id, content);
      
      const message = {
        id: info.lastInsertRowid,
        sender_id,
        receiver_id,
        content,
        created_at: new Date().toISOString()
      };

      // Emit to receiver and sender
      io.to(receiver_id).emit('receive_message', message);
      io.to(sender_id).emit('receive_message', message); // Confirm sent
    });

    socket.on('disconnect', () => {
      console.log('User disconnected');
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
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
