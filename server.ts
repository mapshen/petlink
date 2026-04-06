import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { initDb } from './src/server/db.ts';
import { startCareTaskReminderScheduler, stopCareTaskReminderScheduler } from './src/server/care-task-reminders.ts';
import { startBookingReminderScheduler, stopBookingReminderScheduler } from './src/server/booking-reminders.ts';
import { startOnboardingReminderScheduler, stopOnboardingReminderScheduler } from './src/server/onboarding-reminders.ts';
import { startDepositReleaseScheduler, stopDepositReleaseScheduler } from './src/server/deposit-release.ts';
import sql from './src/server/db.ts';
import { createPublicLimiter, createApiLimiter, createAuthLimiter } from './src/server/rate-limit.ts';
import {
  authRoutes, userRoutes, petRoutes, sitterRoutes, serviceRoutes,
  bookingRoutes, reviewRoutes, verificationRoutes, availabilityRoutes,
  photoRoutes, favoriteRoutes, messageRoutes, notificationRoutes,
  paymentRoutes, subscriptionRoutes, walkRoutes, analyticsRoutes,
  adminRoutes, uploadRoutes, calendarRoutes, importRoutes, miscRoutes, postRoutes, speciesProfileRoutes, tipRoutes, profileMemberRoutes, inquiryRoutes, referenceRoutes, addonRoutes, incidentRoutes, disputeRoutes,
} from './src/server/routes/index.ts';
import type { ErrorRequestHandler } from 'express';
import logger, { sanitizeError } from './src/server/logger.ts';

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

  // Request logging
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const log = `${req.method} ${req.path} ${res.statusCode} ${duration}ms [${requestId.slice(0, 8)}]`;
      if (res.statusCode >= 500) logger.error(log);
      else if (res.statusCode >= 400) logger.warn(log);
    });
    next();
  });

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

  // Register all domain routes
  authRoutes(v1);
  userRoutes(v1);
  petRoutes(v1);
  sitterRoutes(v1, publicLimiter);
  serviceRoutes(v1);
  bookingRoutes(v1, io);
  reviewRoutes(v1);
  verificationRoutes(v1, publicLimiter);
  availabilityRoutes(v1, publicLimiter);
  photoRoutes(v1, publicLimiter);
  favoriteRoutes(v1);
  messageRoutes(v1, io);
  notificationRoutes(v1);
  paymentRoutes(v1);
  subscriptionRoutes(v1);
  walkRoutes(v1, io);
  analyticsRoutes(v1);
  adminRoutes(v1);
  uploadRoutes(v1);
  calendarRoutes(v1, publicLimiter);
  importRoutes(v1);
  miscRoutes(v1);
  postRoutes(v1, publicLimiter);
  speciesProfileRoutes(v1, publicLimiter);
  tipRoutes(v1);
  profileMemberRoutes(v1, publicLimiter);
  inquiryRoutes(v1, io);
  referenceRoutes(v1, publicLimiter);
  addonRoutes(v1, publicLimiter);
  incidentRoutes(v1, io);
  disputeRoutes(v1, io);

  // Mount versioned API router at /api/v1 (canonical) and /api (backwards compat)
  app.use('/api/v1', v1);
  app.use('/api', v1);

  // Global error handler — catches unhandled errors from async route handlers
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    logger.error({ err: sanitizeError(err) }, 'Unhandled route error');
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
    // SPA fallback: serve index.html for non-API routes (client-side routing)
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    startCareTaskReminderScheduler(io);
    startBookingReminderScheduler(io);
    startOnboardingReminderScheduler();
    startDepositReleaseScheduler(io);
  });

  const shutdown = () => {
    stopCareTaskReminderScheduler();
    stopBookingReminderScheduler();
    stopOnboardingReminderScheduler();
    stopDepositReleaseScheduler();
    io.close();
    httpServer.close(() => {
      sql.end({ timeout: 5 }).then(() => process.exit(0)).catch(() => process.exit(1));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
