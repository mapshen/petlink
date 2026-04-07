import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createLostPetAlertSchema, resolveLostPetAlertSchema, nearbyAlertsQuerySchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import { sendEmail, buildLostPetAlertEmail, buildLostPetResolvedEmail } from '../email.ts';
import logger, { sanitizeError } from '../logger.ts';

const MAX_ACTIVE_ALERTS_PER_USER = 5;
const METERS_PER_MILE = 1609.34;

export default function lostPetAlertRoutes(router: Router, io: Server): void {
  // Create a lost pet alert
  router.post('/lost-pet-alerts', authMiddleware, validate(createLostPetAlertSchema), async (req: AuthenticatedRequest, res) => {
    const { pet_id, description, last_seen_lat, last_seen_lng, last_seen_at, search_radius_miles, photo_url, contact_phone } = req.body;

    // Verify pet belongs to the user
    const [pet] = await sql`SELECT id, name, species, breed, photo_url FROM pets WHERE id = ${pet_id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found or does not belong to you' });
      return;
    }

    // Rate limit: max active alerts per user
    const [{ count: activeCount }] = await sql`
      SELECT COUNT(*)::int as count FROM lost_pet_alerts
      WHERE owner_id = ${req.userId} AND status = 'active'
    `;
    if (activeCount >= MAX_ACTIVE_ALERTS_PER_USER) {
      res.status(429).json({ error: 'Maximum active alerts reached. Resolve existing alerts first.' });
      return;
    }

    // Check for existing active alert for this pet
    const [existingAlert] = await sql`
      SELECT id FROM lost_pet_alerts WHERE pet_id = ${pet_id} AND status = 'active'
    `;
    if (existingAlert) {
      res.status(409).json({ error: 'An active alert already exists for this pet' });
      return;
    }

    const radiusMiles = search_radius_miles ?? 10;
    const radiusMeters = radiusMiles * METERS_PER_MILE;

    // Insert alert
    const [alert] = await sql`
      INSERT INTO lost_pet_alerts (pet_id, owner_id, description, last_seen_lat, last_seen_lng,
        last_seen_location, last_seen_at, search_radius_miles, photo_url, contact_phone)
      VALUES (${pet_id}, ${req.userId}, ${description},
        ${last_seen_lat}, ${last_seen_lng},
        ST_SetSRID(ST_MakePoint(${last_seen_lng}, ${last_seen_lat}), 4326)::geography,
        ${last_seen_at}, ${radiusMiles}, ${photo_url ?? null}, ${contact_phone ?? null})
      RETURNING *
    `;

    // Find nearby approved sitters within the search radius
    const nearbySitters = await sql`
      SELECT u.id, u.name, u.email
      FROM users u
      WHERE u.roles @> '{sitter}'::text[]
        AND u.approval_status = 'approved'
        AND u.location IS NOT NULL
        AND u.id != ${req.userId}
        AND ST_DWithin(u.location,
          ST_SetSRID(ST_MakePoint(${last_seen_lng}, ${last_seen_lat}), 4326)::geography,
          ${radiusMeters})
    `;

    const [owner] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;

    // Batch-notify sitters (fire-and-forget for performance)
    const notificationPromises = nearbySitters.map(async (sitter: { id: number; name: string; email: string }) => {
      try {
        // Record notification
        await sql`
          INSERT INTO lost_pet_alert_notifications (alert_id, sitter_id)
          VALUES (${alert.id}, ${sitter.id})
          ON CONFLICT DO NOTHING
        `;

        // In-app notification
        const notification = await createNotification(
          sitter.id,
          'lost_pet_alert',
          'Lost Pet Alert',
          `${owner.name}'s ${pet.species} ${pet.name} is missing near you. Keep an eye out!`,
          { alert_id: alert.id, pet_id: pet.id, pet_name: pet.name }
        );
        if (notification) {
          io.to(String(sitter.id)).emit('notification', notification);
        }

        // Email
        const emailContent = buildLostPetAlertEmail({
          sitterName: sitter.name,
          ownerName: owner.name,
          petName: pet.name,
          petSpecies: pet.species,
          description,
          lastSeenAt: last_seen_at,
          contactPhone: contact_phone,
          alertId: alert.id,
        });
        await sendEmail({ to: sitter.email, ...emailContent });
      } catch (err) {
        logger.error({ err: sanitizeError(err as Error), sitterId: sitter.id }, 'Failed to notify sitter of lost pet');
      }
    });

    // Don't await all — fire-and-forget
    Promise.all(notificationPromises).catch((err) => {
      logger.error({ err: sanitizeError(err as Error) }, 'Batch notification failed for lost pet alert');
    });

    res.status(201).json({
      alert: {
        ...alert,
        pet_name: pet.name,
        pet_species: pet.species,
        pet_breed: pet.breed,
        pet_photo_url: pet.photo_url,
        owner_name: owner.name,
        notified_sitter_count: nearbySitters.length,
      },
    });
  });

  // Get nearby active alerts (for sitters)
  router.get('/lost-pet-alerts/nearby', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = nearbyAlertsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { limit: limitParam, offset: offsetParam } = parsed.data;
    const limit = Math.min(limitParam ?? 20, 50);
    const offset = offsetParam ?? 0;

    // Get sitter's location — fallback to query params
    const [user] = await sql`SELECT lat, lng, location FROM users WHERE id = ${req.userId}`;
    const lat = parsed.data.lat ?? user?.lat;
    const lng = parsed.data.lng ?? user?.lng;

    if (lat == null || lng == null) {
      res.status(400).json({ error: 'Location is required. Set your location in your profile or provide lat/lng.' });
      return;
    }

    const radius = (parsed.data.radius ?? 25) * METERS_PER_MILE; // default 25 mile viewing radius

    const alerts = await sql`
      SELECT a.*,
             p.name as pet_name, p.species as pet_species, p.breed as pet_breed, p.photo_url as pet_photo_url,
             u.name as owner_name, u.avatar_url as owner_avatar,
             ST_Distance(a.last_seen_location,
               ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM lost_pet_alerts a
      JOIN pets p ON a.pet_id = p.id
      JOIN users u ON a.owner_id = u.id
      WHERE a.status = 'active'
        AND ST_DWithin(a.last_seen_location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius})
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({ alerts });
  });

  // Get alert detail
  router.get('/lost-pet-alerts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const [alert] = await sql`
      SELECT a.*,
             p.name as pet_name, p.species as pet_species, p.breed as pet_breed, p.photo_url as pet_photo_url,
             u.name as owner_name, u.avatar_url as owner_avatar
      FROM lost_pet_alerts a
      JOIN pets p ON a.pet_id = p.id
      JOIN users u ON a.owner_id = u.id
      WHERE a.id = ${alertId}
    `;

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Get notified sitter count
    const [{ count: notifiedCount }] = await sql`
      SELECT COUNT(*)::int as count FROM lost_pet_alert_notifications WHERE alert_id = ${alertId}
    `;

    res.json({ alert: { ...alert, notified_sitter_count: notifiedCount } });
  });

  // Resolve (mark as found / cancel) — owner only
  router.put('/lost-pet-alerts/:id/resolve', authMiddleware, validate(resolveLostPetAlertSchema), async (req: AuthenticatedRequest, res) => {
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const { status } = req.body;

    const [alert] = await sql`
      SELECT a.*, p.name as pet_name, p.species as pet_species
      FROM lost_pet_alerts a
      JOIN pets p ON a.pet_id = p.id
      WHERE a.id = ${alertId}
    `;
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    if (alert.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the pet owner can resolve this alert' });
      return;
    }
    if (alert.status !== 'active') {
      res.status(400).json({ error: 'Alert is already resolved' });
      return;
    }

    const [updated] = await sql`
      UPDATE lost_pet_alerts SET status = ${status}, resolved_at = NOW()
      WHERE id = ${alertId} AND status = 'active'
      RETURNING *
    `;

    // Notify all previously notified sitters
    const notifiedSitters = await sql`
      SELECT u.id, u.name, u.email
      FROM lost_pet_alert_notifications n
      JOIN users u ON n.sitter_id = u.id
      WHERE n.alert_id = ${alertId}
    `;

    const resolvePromises = notifiedSitters.map(async (sitter: { id: number; name: string; email: string }) => {
      try {
        const statusLabel = status === 'found' ? 'found safe' : 'alert cancelled';
        const notification = await createNotification(
          sitter.id,
          'lost_pet_alert',
          `Lost Pet ${status === 'found' ? 'Found' : 'Update'}`,
          `${alert.pet_name} has been ${statusLabel}. Thank you for keeping an eye out!`,
          { alert_id: alertId, status }
        );
        if (notification) {
          io.to(String(sitter.id)).emit('notification', notification);
        }

        const emailContent = buildLostPetResolvedEmail({
          sitterName: sitter.name,
          petName: alert.pet_name,
          status,
        });
        await sendEmail({ to: sitter.email, ...emailContent });
      } catch (err) {
        logger.error({ err: sanitizeError(err as Error), sitterId: sitter.id }, 'Failed to notify sitter of alert resolution');
      }
    });

    Promise.all(resolvePromises).catch((err) => {
      logger.error({ err: sanitizeError(err as Error) }, 'Batch resolve notification failed');
    });

    res.json({ alert: updated });
  });
}
