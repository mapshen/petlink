import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = pino({
  level: LOG_LEVEL,
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 },
    },
  }),
});

/** Sanitize error for logging — strip sensitive fields from Stripe/DB errors */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export default logger;
