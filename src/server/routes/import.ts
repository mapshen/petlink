import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, importPreviewSchema, verifyImportSchema, confirmImportSchema, applyProfileSchema } from '../validation.ts';
import { parseRoverUrl, generateVerificationCode, scrapeRoverProfile, checkVerificationCode } from '../profile-import.ts';

export default function importRoutes(router: Router): void {
  router.post('/import/preview', authMiddleware, validate(importPreviewSchema), async (req: AuthenticatedRequest, res) => {
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

  router.post('/import/start-verification', authMiddleware, validate(importPreviewSchema), async (req: AuthenticatedRequest, res) => {
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

  router.post('/import/verify', authMiddleware, validate(verifyImportSchema), async (req: AuthenticatedRequest, res) => {
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

  router.post('/import/confirm', authMiddleware, validate(confirmImportSchema), async (req: AuthenticatedRequest, res) => {
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

  router.post('/import/apply-profile', authMiddleware, validate(applyProfileSchema), async (req: AuthenticatedRequest, res) => {
    const { profile_id } = req.body;
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

  router.get('/import/profiles', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const profiles = await sql`
      SELECT id, platform, profile_url, display_name, rating, review_count, verification_status, verified_at, created_at
      FROM imported_profiles WHERE sitter_id = ${req.userId}
      ORDER BY created_at DESC
    `;
    res.json({ profiles });
  });

  router.delete('/import/profiles/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [profile] = await sql`SELECT id FROM imported_profiles WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!profile) {
      res.status(404).json({ error: 'Import profile not found' });
      return;
    }
    await sql`DELETE FROM imported_profiles WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });
}
