import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, signedUrlSchema } from '../validation.ts';
import { generateUploadUrl } from '../storage.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function uploadRoutes(router: Router): void {
  router.post('/uploads/signed-url', authMiddleware, validate(signedUrlSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { folder, contentType, fileSize } = req.body;
      const MAX_SIZE: Record<string, number> = {
        pets: 5 * 1024 * 1024,
        avatars: 5 * 1024 * 1024,
        'sitter-photos': 5 * 1024 * 1024,
        verifications: 5 * 1024 * 1024,
        walks: 5 * 1024 * 1024,
        videos: 10 * 1024 * 1024,
        posts: 5 * 1024 * 1024,
        incidents: 10 * 1024 * 1024,
        disputes: 10 * 1024 * 1024,
      };
      const maxBytes = MAX_SIZE[folder];
      if (fileSize > maxBytes) {
        const maxMB = maxBytes / (1024 * 1024);
        res.status(400).json({ error: `File must be under ${maxMB}MB for ${folder}` });
        return;
      }
      const result = await generateUploadUrl(folder, contentType, req.userId!);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Upload URL error');
      res.status(500).json({ error: 'Failed to generate upload URL. Is S3 configured?' });
    }
  });
}
