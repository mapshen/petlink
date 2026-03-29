import rateLimit from 'express-rate-limit';

const devMultiplier = process.env.NODE_ENV !== 'production' ? 10 : 1;

export function createPublicLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30 * devMultiplier,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });
}

export function createApiLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100 * devMultiplier,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}

export function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20 * devMultiplier,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again later' },
  });
}
