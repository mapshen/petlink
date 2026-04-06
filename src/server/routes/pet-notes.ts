import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate, privatePetNoteSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function petNoteRoutes(router: Router): void {
  // Sitter creates a private note about a pet after a completed booking
  router.post('/pets/:petId/notes', authMiddleware, validate(privatePetNoteSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const petId = Number(req.params.petId);
      if (!Number.isInteger(petId) || petId <= 0) {
        res.status(400).json({ error: 'Invalid pet ID' });
        return;
      }

      const { content, flags, booking_id } = req.body;

      // Verify: user is a sitter
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can create pet notes' });
        return;
      }

      // Verify: booking exists, is completed, user is the sitter, and pet is in the booking
      const [booking] = await sql`
        SELECT b.id, b.sitter_id, b.status
        FROM bookings b
        JOIN booking_pets bp ON bp.booking_id = b.id AND bp.pet_id = ${petId}
        WHERE b.id = ${booking_id} AND b.sitter_id = ${req.userId} AND b.status = 'completed'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Completed booking not found for this pet' });
        return;
      }

      // Verify pet exists
      const [pet] = await sql`SELECT id FROM pets WHERE id = ${petId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }

      const [note] = await sql`
        INSERT INTO private_pet_notes (sitter_id, pet_id, booking_id, content, flags)
        VALUES (${req.userId}, ${petId}, ${booking_id}, ${content}, ${flags})
        ON CONFLICT (sitter_id, booking_id) DO UPDATE
        SET content = ${content}, flags = ${flags}, updated_at = NOW()
        RETURNING id, created_at, updated_at
      `;

      res.status(201).json({ note: { id: note.id, created_at: note.created_at, updated_at: note.updated_at } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create pet note');
      res.status(500).json({ error: 'Failed to create pet note' });
    }
  });

  // Sitter updates their own note
  router.put('/pets/:petId/notes/:noteId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const noteId = Number(req.params.noteId);
      const petId = Number(req.params.petId);
      if (!Number.isInteger(noteId) || noteId <= 0 || !Number.isInteger(petId) || petId <= 0) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const { content, flags } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
        res.status(400).json({ error: 'Content is required (max 2000 characters)' });
        return;
      }

      const [updated] = await sql`
        UPDATE private_pet_notes
        SET content = ${content.trim()}, flags = ${flags || []}, updated_at = NOW()
        WHERE id = ${noteId} AND sitter_id = ${req.userId} AND pet_id = ${petId}
        RETURNING id, updated_at
      `;
      if (!updated) {
        res.status(404).json({ error: 'Note not found or not yours' });
        return;
      }

      res.json({ note: { id: updated.id, updated_at: updated.updated_at } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update pet note');
      res.status(500).json({ error: 'Failed to update pet note' });
    }
  });

  // Admin: view all private notes for a pet
  router.get('/admin/pets/:petId/notes', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const petId = Number(req.params.petId);
      if (!Number.isInteger(petId) || petId <= 0) {
        res.status(400).json({ error: 'Invalid pet ID' });
        return;
      }

      const notes = await sql`
        SELECT ppn.id, ppn.sitter_id, ppn.booking_id, ppn.content, ppn.flags, ppn.created_at, ppn.updated_at,
               u.name as sitter_name, u.email as sitter_email
        FROM private_pet_notes ppn
        JOIN users u ON u.id = ppn.sitter_id
        WHERE ppn.pet_id = ${petId}
        ORDER BY ppn.created_at DESC
      `;

      res.json({ notes });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pet notes');
      res.status(500).json({ error: 'Failed to fetch pet notes' });
    }
  });

  // Admin: get flag summary for a pet
  router.get('/admin/pets/:petId/flag-summary', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const petId = Number(req.params.petId);
      if (!Number.isInteger(petId) || petId <= 0) {
        res.status(400).json({ error: 'Invalid pet ID' });
        return;
      }

      const [summary] = await sql`
        SELECT
          COUNT(*)::int as total_notes,
          COUNT(*) FILTER (WHERE flags != '{}')::int as flagged_notes,
          (SELECT array_agg(DISTINCT f) FROM private_pet_notes ppn2, unnest(ppn2.flags) f WHERE ppn2.pet_id = ${petId}) as all_flags
        FROM private_pet_notes
        WHERE pet_id = ${petId}
      `;

      res.json({
        pet_id: petId,
        total_notes: summary.total_notes,
        flagged_notes: summary.flagged_notes,
        flags: summary.all_flags || [],
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pet flag summary');
      res.status(500).json({ error: 'Failed to fetch pet flag summary' });
    }
  });
}
