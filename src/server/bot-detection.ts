import type { Request, Response, NextFunction } from 'express';

export const KNOWN_BOT_PATTERNS: RegExp[] = [
  /python-requests/i,
  /scrapy/i,
  /curl\//i,
  /wget\//i,
  /httpclient/i,
  /go-http-client/i,
  /libwww-perl/i,
  /mechanize/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

export function isBotUserAgent(ua: string): boolean {
  return KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(ua));
}

export function requireUserAgent(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ua = req.headers['user-agent'];
  if (!ua || ua.trim() === '') {
    res.status(403).json({ error: 'User-Agent header is required' });
    return;
  }
  next();
}

export function botBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ua = req.headers['user-agent'];
  if (!ua || ua.trim() === '') {
    res.status(403).json({ error: 'Automated access not permitted' });
    return;
  }

  if (isBotUserAgent(ua)) {
    res.status(403).json({ error: 'Automated access not permitted' });
    return;
  }

  next();
}
