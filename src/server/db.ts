import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import logger from './logger.ts';
import { backfillSpeciesProfiles } from './backfill-species-profiles.ts';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/petlink';

const SCHEMA_RAW = process.env.DB_SCHEMA || 'petlink';
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA_RAW)) {
  throw new Error(`Invalid DB_SCHEMA: "${SCHEMA_RAW}" — must be a valid PostgreSQL identifier`);
}
const SCHEMA = SCHEMA_RAW;

const sql = postgres(DATABASE_URL, {
  max: Number(process.env.DB_MAX_CONNECTIONS) || 20,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: {
    search_path: SCHEMA,
  },
});

export async function initDb() {
  // Create dedicated schema
  await sql`CREATE SCHEMA IF NOT EXISTS ${sql(SCHEMA)}`;

  // Enable PostGIS in dedicated schema
  await sql`CREATE EXTENSION IF NOT EXISTS postgis SCHEMA ${sql(SCHEMA)}`.catch(() => {});

  await sql`
    DO $$ BEGIN
      CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE payment_status AS ENUM ('pending', 'held', 'captured', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded'`.catch(() => {});
  await sql`
    DO $$ BEGIN
      CREATE TYPE service_type AS ENUM ('walking', 'sitting', 'drop-in', 'grooming', 'meet_greet', 'daycare');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE walk_event_type AS ENUM ('start', 'pee', 'poop', 'photo', 'end', 'fed', 'water', 'medication', 'nap_start', 'nap_end', 'play', 'video', 'litter_box', 'habitat_check');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE id_check_status AS ENUM ('pending', 'approved', 'rejected');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE bg_check_status AS ENUM ('pending', 'submitted', 'passed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE notification_type AS ENUM ('new_booking', 'booking_status', 'new_message', 'walk_started', 'walk_completed', 'payment_update', 'verification_update', 'account_update', 'care_task_reminder', 'new_inquiry', 'inquiry_offer');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE push_platform AS ENUM ('web', 'ios', 'android');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE cancellation_policy AS ENUM ('flexible', 'moderate', 'strict');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      roles TEXT[] NOT NULL DEFAULT '{owner}',
      bio TEXT,
      avatar_url TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      location GEOGRAPHY(Point, 4326),
      slug TEXT UNIQUE,
      stripe_account_id TEXT,
      stripe_customer_id TEXT,
      subscription_tier TEXT DEFAULT 'free',
      approval_status TEXT DEFAULT 'approved' CHECK(approval_status IN ('approved', 'pending_approval', 'rejected', 'banned', 'onboarding')),
      approval_rejected_reason TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      accepted_pet_sizes TEXT[] DEFAULT '{}', -- DEPRECATED: use sitter_species_profiles.accepted_pet_sizes
      accepted_species TEXT[] DEFAULT '{}', -- kept as source-of-truth for species list
      cancellation_policy cancellation_policy DEFAULT 'flexible',
      years_experience INTEGER, -- DEPRECATED: use sitter_species_profiles.years_experience
      home_type TEXT,
      has_yard BOOLEAN DEFAULT false, -- DEPRECATED: use sitter_species_profiles.has_yard
      has_fenced_yard BOOLEAN DEFAULT false, -- DEPRECATED: use sitter_species_profiles.has_fenced_yard
      has_own_pets BOOLEAN DEFAULT false, -- DEPRECATED: use sitter_species_profiles.owns_same_species
      own_pets_description TEXT, -- DEPRECATED: use sitter_species_profiles.own_pets_description
      skills TEXT[] DEFAULT '{}', -- DEPRECATED: use sitter_species_profiles.skills
      service_radius_miles INTEGER DEFAULT 10,
      max_pets_at_once INTEGER DEFAULT 3, -- DEPRECATED: use sitter_species_profiles.max_pets
      max_pets_per_walk INTEGER DEFAULT 2, -- DEPRECATED: use sitter_species_profiles.max_pets_per_walk
      house_rules TEXT,
      emergency_procedures TEXT,
      has_insurance BOOLEAN DEFAULT false,
      email_verified BOOLEAN DEFAULT false,
      is_pro BOOLEAN DEFAULT false,
      non_smoking_home BOOLEAN DEFAULT false,
      children_in_home BOOLEAN DEFAULT false,
      one_client_at_a_time BOOLEAN DEFAULT false,
      safety_environment TEXT,
      typical_day TEXT,
      info_wanted_about_pets TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relationship TEXT,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pets (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      species TEXT DEFAULT 'dog',
      breed TEXT,
      age INTEGER,
      weight DOUBLE PRECISION,
      gender TEXT,
      spayed_neutered BOOLEAN,
      energy_level TEXT,
      house_trained BOOLEAN,
      temperament TEXT[] DEFAULT '{}',
      special_needs TEXT,
      microchip_number TEXT,
      vet_name TEXT,
      vet_phone TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      medical_history TEXT,
      photo_url TEXT,
      care_instructions JSONB DEFAULT '[]'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type service_type NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      additional_pet_price_cents INTEGER DEFAULT 0,
      max_pets INTEGER DEFAULT 1,
      service_details JSONB,
      species TEXT,
      holiday_rate_cents INTEGER,
      puppy_rate_cents INTEGER,
      pickup_dropoff_fee_cents INTEGER,
      grooming_addon_fee_cents INTEGER
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      pet_id INTEGER REFERENCES pets(id) ON DELETE SET NULL,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      status booking_status DEFAULT 'pending',
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      total_price_cents INTEGER,
      payment_intent_id TEXT,
      payment_status payment_status DEFAULT 'pending',
      payment_method TEXT DEFAULT 'card' CHECK(payment_method IN ('card', 'ach_debit')),
      payment_failure_reason TEXT,
      responded_at TIMESTAMPTZ,
      booking_reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS booking_pets (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (booking_id, pet_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sitter_addons (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addon_slug TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(sitter_id, addon_slug)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS booking_addons (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      addon_id INTEGER REFERENCES sitter_addons(id) ON DELETE SET NULL,
      addon_slug TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      PRIMARY KEY (booking_id, addon_slug)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS incident_reports (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other')),
      description TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_incident_reports_booking ON incident_reports (booking_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS incident_evidence (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_incident_evidence_incident ON incident_evidence (incident_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS disputes (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      incident_id INTEGER REFERENCES incident_reports(id),
      filed_by INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'under_review', 'awaiting_response', 'resolved', 'closed')),
      assigned_admin_id INTEGER REFERENCES users(id),
      resolution_type TEXT CHECK(resolution_type IN ('full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action')),
      resolution_amount_cents INTEGER,
      resolution_notes TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_disputes_booking ON disputes (booking_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_active_booking ON disputes (booking_id) WHERE status NOT IN ('resolved', 'closed')`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS dispute_messages (
      id SERIAL PRIMARY KEY,
      dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_admin_note BOOLEAN DEFAULT FALSE,
      evidence_urls TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages (dispute_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `;

  // Indexes for conversation query performance
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver_created ON messages (sender_id, receiver_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON messages (receiver_id) WHERE read_at IS NULL`;
  // Trigram index for chat search (ILIKE pattern matching)
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops)`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      reviewer_id INTEGER NOT NULL REFERENCES users(id),
      reviewee_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      pet_care_rating INTEGER CHECK(pet_care_rating >= 1 AND pet_care_rating <= 5),
      communication_rating INTEGER CHECK(communication_rating >= 1 AND communication_rating <= 5),
      reliability_rating INTEGER CHECK(reliability_rating >= 1 AND reliability_rating <= 5),
      pet_accuracy_rating INTEGER CHECK(pet_accuracy_rating >= 1 AND pet_accuracy_rating <= 5),
      preparedness_rating INTEGER CHECK(preparedness_rating >= 1 AND preparedness_rating <= 5),
      response_text TEXT,
      response_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(booking_id, reviewer_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS availability (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER CHECK(day_of_week >= 0 AND day_of_week <= 6),
      specific_date DATE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      recurring BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS walk_events (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      event_type walk_event_type NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      note TEXT,
      photo_url TEXT,
      video_url TEXT,
      pet_id INTEGER REFERENCES pets(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS verifications (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      id_check_status id_check_status DEFAULT 'pending',
      background_check_status bg_check_status DEFAULT 'pending',
      house_photos_url TEXT,
      checkr_candidate_id TEXT,
      checkr_invitation_url TEXT,
      checkr_report_id TEXT,
      submitted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type notification_type NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      new_booking BOOLEAN DEFAULT TRUE,
      booking_status BOOLEAN DEFAULT TRUE,
      new_message BOOLEAN DEFAULT TRUE,
      walk_updates BOOLEAN DEFAULT TRUE,
      booking_reminders BOOLEAN DEFAULT TRUE,
      booking_reminders_email BOOLEAN DEFAULT TRUE,
      email_enabled BOOLEAN DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      token TEXT,
      platform push_platform DEFAULT 'web',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sitter_photos (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, sitter_id),
      CHECK(user_id != sitter_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_id),
      UNIQUE(user_id, provider)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sitter_expenses (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      receipt_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sitter_payouts (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      scheduled_at TIMESTAMPTZ NOT NULL,
      processed_at TIMESTAMPTZ,
      stripe_transfer_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tips (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      tipper_id INTEGER NOT NULL REFERENCES users(id),
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      stripe_payment_intent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(booking_id, tipper_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_tips_sitter_id ON tips (sitter_id)`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS profile_members (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'co_sitter' CHECK(role IN ('co_sitter', 'assistant')),
      background_check_status TEXT DEFAULT 'not_started' CHECK(background_check_status IN ('not_started', 'pending', 'passed', 'failed')),
      checkr_candidate_id TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_members_sitter ON profile_members (sitter_id)`.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      ip_address TEXT,
      attempted_at TIMESTAMPTZ DEFAULT NOW(),
      success BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, attempted_at)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, attempted_at) WHERE success = false`.catch(() => {});

  // Performance indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_owner_id ON bookings (owner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_sitter_id ON bookings (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_sitter_id ON services (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews (reviewee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_availability_sitter_id ON availability (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_walk_events_booking_id ON walk_events (booking_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_photos_sitter_id ON sitter_photos (sitter_id, sort_order)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_verifications_sitter_id ON verifications (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_pets_booking_id ON booking_pets (booking_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_expenses_sitter_id ON sitter_expenses (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_payouts_sitter_id ON sitter_payouts (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_payouts_status ON sitter_payouts (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_payouts_pending_scheduled ON sitter_payouts (status, scheduled_at) WHERE status = 'pending'`;

  // Create spatial index on users.location if PostGIS is available
  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST (location)
  `.catch(() => {});

  // Auto-update location column when lat/lng change
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION update_user_location()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      ELSE
        NEW.location = NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
    SET search_path = ${SCHEMA}
  `).catch(() => {});

  await sql`
    DO $$ BEGIN
      CREATE TRIGGER trg_update_user_location
        BEFORE INSERT OR UPDATE OF lat, lng ON users
        FOR EACH ROW EXECUTE FUNCTION update_user_location();
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `.catch(() => {});

  // Schema migrations for existing databases (columns now baked into CREATE TABLE above)
  await sql`ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'daycare'`.catch(() => {});
  await sql`ALTER TYPE walk_event_type ADD VALUE IF NOT EXISTS 'litter_box'`.catch(() => {});
  await sql`ALTER TYPE walk_event_type ADD VALUE IF NOT EXISTS 'habitat_check'`.catch(() => {});

  // Issue #98: Recurring bookings
  await sql`
    CREATE TABLE IF NOT EXISTS recurring_bookings (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      pet_ids INTEGER[] NOT NULL DEFAULT '{}',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      next_occurrence DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_recurring_bookings_owner ON recurring_bookings (owner_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_recurring_bookings_active ON recurring_bookings (active, next_occurrence)`.catch(() => {});
  // Issue #109: Pet vaccinations table
  await sql`
    CREATE TABLE IF NOT EXISTS pet_vaccinations (
      id SERIAL PRIMARY KEY,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      vaccine_name TEXT NOT NULL,
      administered_date DATE,
      expires_at DATE,
      document_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pet_vaccinations_pet_id ON pet_vaccinations (pet_id)`.catch(() => {});

  // Issue #100: Booking care tasks (checklist items derived from pet care instructions)
  await sql`
    CREATE TABLE IF NOT EXISTS booking_care_tasks (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      time TEXT,
      notes TEXT,
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      scheduled_time TIMESTAMPTZ,
      reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_care_tasks_booking_id ON booking_care_tasks (booking_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_care_tasks_pet_id ON booking_care_tasks (pet_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_care_tasks_scheduled_time ON booking_care_tasks (scheduled_time) WHERE scheduled_time IS NOT NULL`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_bct_reminder_candidates ON booking_care_tasks (scheduled_time) WHERE scheduled_time IS NOT NULL AND completed = false AND reminder_sent_at IS NULL`.catch(() => {});

  // Issue #90: Featured/sponsored sitter listings (per-booking commission model)
  await sql`
    CREATE TABLE IF NOT EXISTS featured_listings (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_type TEXT,
      commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.15,
      active BOOLEAN DEFAULT TRUE,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      bookings_from_promotion INTEGER NOT NULL DEFAULT 0,
      commission_earned_cents INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(sitter_id, service_type)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_featured_listings_active ON featured_listings (active, service_type)`.catch(() => {});

  // Issue #89: Sitter Pro membership
  await sql`
    CREATE TABLE IF NOT EXISTS sitter_subscriptions (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro')),
      stripe_subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled')),
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // User indexes and constraints
  await sql`CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users (approval_status)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_users_slug ON users (slug) WHERE slug IS NOT NULL`.catch(() => {});
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check`.catch(() => {});
  await sql`ALTER TABLE users ADD CONSTRAINT users_roles_check CHECK(roles <@ '{owner,sitter,admin}'::text[])`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN (roles)`.catch(() => {});
  // Backfill slugs for existing users without one
  await sql`
    UPDATE users SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '''', '')) || '-' || id
    WHERE slug IS NULL AND name IS NOT NULL
  `.catch(() => {});

  // Bootstrap admin role for ADMIN_EMAIL user
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sql`
      UPDATE users SET roles = array_append(roles, 'admin')
      WHERE lower(email) = ${adminEmail.toLowerCase()} AND NOT (roles @> '{admin}'::text[])
    `.catch(() => {});
  }

  // Issue #97: Imported profiles and reviews
  await sql`
    CREATE TABLE IF NOT EXISTS imported_profiles (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      bio TEXT,
      rating DOUBLE PRECISION,
      review_count INTEGER,
      verification_code TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending', 'verified', 'failed')),
      verified_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(sitter_id, platform)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS imported_reviews (
      id SERIAL PRIMARY KEY,
      imported_profile_id INTEGER NOT NULL REFERENCES imported_profiles(id) ON DELETE CASCADE,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      review_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_imported_profiles_sitter_id ON imported_profiles (sitter_id)`.catch(() => {});
  // Migration: add verification_status column if table only has legacy 'verified' boolean
  await sql`ALTER TABLE imported_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'`.catch(() => {});
  // Backfill verification_status from legacy verified column
  await sql`UPDATE imported_profiles SET verification_status = 'verified' WHERE verified = true AND (verification_status IS NULL OR verification_status = 'pending')`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_imported_reviews_sitter_id ON imported_reviews (sitter_id)`.catch(() => {});
  // Allow manual imported reviews without an imported_profile
  await sql`ALTER TABLE imported_reviews ALTER COLUMN imported_profile_id DROP NOT NULL`.catch(() => {});

  // Sitter references (client vouches)
  await sql`
    CREATE TABLE IF NOT EXISTS sitter_references (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      invite_token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE(sitter_id, client_email)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_references_sitter ON sitter_references (sitter_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_references_token ON sitter_references (invite_token)`.catch(() => {});

  // Extend approval_status for gated onboarding flow
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check`.catch(() => {});
  await sql`ALTER TABLE users ADD CONSTRAINT users_approval_status_check CHECK(approval_status IN ('approved', 'pending_approval', 'rejected', 'banned', 'onboarding'))`.catch(() => {});

  // Issue #146: Calendar token-based iCal export
  await sql`
    CREATE TABLE IF NOT EXISTS calendar_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_tokens_user ON calendar_tokens (user_id)`.catch(() => {});

  // Issue #189: JWT refresh tokens
  await sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash)`.catch(() => {});

  // Issue #165: Profile view tracking
  await sql`
    CREATE TABLE IF NOT EXISTS profile_views (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      viewed_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT DEFAULT 'direct',
      session_id TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_profile_views_sitter ON profile_views (sitter_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_at ON profile_views (viewed_at)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_profile_views_dedup ON profile_views (sitter_id, session_id, viewed_at DESC) WHERE session_id IS NOT NULL`.catch(() => {});

  // Performance indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_sitter_status ON bookings(sitter_id, status)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_imported_reviews_profile ON imported_reviews(imported_profile_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_owner ON bookings(owner_id)`.catch(() => {});

  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews (reviewer_id)`.catch(() => {});

  // Issue #266: Sitter posts (Instagram-style profile content)
  await sql`
    CREATE TABLE IF NOT EXISTS sitter_posts (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      photo_url TEXT,
      video_url TEXT,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      walk_event_id INTEGER REFERENCES walk_events(id) ON DELETE SET NULL,
      post_type TEXT NOT NULL DEFAULT 'update' CHECK (post_type IN ('update', 'walk_photo', 'walk_video', 'care_update')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_posts_sitter ON sitter_posts (sitter_id, created_at DESC)`.catch(() => {});

  // Issue #302: Per-species sitter profiles
  await sql`
    CREATE TABLE IF NOT EXISTS sitter_species_profiles (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      species TEXT NOT NULL,
      years_experience INTEGER,
      accepted_pet_sizes TEXT[] DEFAULT '{}',
      skills TEXT[] DEFAULT '{}',
      max_pets INTEGER DEFAULT 1,
      max_pets_per_walk INTEGER,
      has_yard BOOLEAN DEFAULT false,
      has_fenced_yard BOOLEAN DEFAULT false,
      dogs_on_furniture BOOLEAN DEFAULT false,
      dogs_on_bed BOOLEAN DEFAULT false,
      potty_break_frequency TEXT,
      accepts_puppies BOOLEAN DEFAULT true,
      accepts_unspayed BOOLEAN DEFAULT true,
      accepts_unneutered BOOLEAN DEFAULT true,
      accepts_females_in_heat BOOLEAN DEFAULT true,
      owns_same_species BOOLEAN DEFAULT false,
      own_pets_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(sitter_id, species)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sitter_species_profiles_sitter ON sitter_species_profiles (sitter_id)`.catch(() => {});

  // Columns species, holiday_rate_cents, puppy_rate_cents, pickup_dropoff_fee_cents,
  // grooming_addon_fee_cents are now in the CREATE TABLE above.
  // Float-to-cents backfill (Issue #287) already completed — removed.

  // Issue #351: Booking inquiries
  await sql`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      service_type service_type,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open', 'offer_sent', 'accepted', 'declined', 'expired')),
      offer_price_cents INTEGER,
      offer_start_time TIMESTAMPTZ,
      offer_end_time TIMESTAMPTZ,
      offer_notes TEXT,
      offer_sent_at TIMESTAMPTZ,
      booking_id INTEGER REFERENCES bookings(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS inquiry_pets (
      inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (inquiry_id, pet_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_inquiries_owner ON inquiries (owner_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_inquiries_sitter ON inquiries (sitter_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status)`.catch(() => {});
  // Partial unique index: one active inquiry per owner-sitter pair
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_active_pair ON inquiries (owner_id, sitter_id) WHERE status IN ('open', 'offer_sent')`.catch(() => {});
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS inquiry_id INTEGER REFERENCES inquiries(id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_inquiry ON messages (inquiry_id) WHERE inquiry_id IS NOT NULL`.catch(() => {});
  // Extend notification_type enum for inquiry notifications
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_inquiry'`.catch(() => {});
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_offer'`.catch(() => {});
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'incident_report'`.catch(() => {});
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_update'`.catch(() => {});

  // Issue #377: Meet & greet deposit with booking credit
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_status TEXT CHECK(deposit_status IN ('held', 'captured_as_deposit', 'applied', 'released_to_sitter', 'refunded'))`.catch(() => {});
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_applied_to_booking_id INTEGER REFERENCES bookings(id)`.catch(() => {});
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meet_greet_notes TEXT`.catch(() => {});
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_reminder_count INTEGER DEFAULT 0`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_deposit_status ON bookings (deposit_status) WHERE deposit_status IS NOT NULL`.catch(() => {});

  // Issue #348: Day-before booking reminders
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_reminder_sent_at TIMESTAMPTZ`.catch(() => {});
  await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS booking_reminders BOOLEAN DEFAULT TRUE`.catch(() => {});
  await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS booking_reminders_email BOOLEAN DEFAULT TRUE`.catch(() => {});

  // Issue #337: Onboarding reminders
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_reminder_sent_at TIMESTAMPTZ`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_reminder_count INTEGER DEFAULT 0`.catch(() => {});

  // Indexes for search performance
  await sql`CREATE INDEX IF NOT EXISTS idx_services_species ON services (species)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_pets_owner_id ON pets (owner_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_users_accepted_species ON users USING GIN (accepted_species)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_users_accepted_pet_sizes ON users USING GIN (accepted_pet_sizes)`.catch(() => {});
  // Unique constraint: one service per (sitter, type, species) combination
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_services_sitter_type_species ON services (sitter_id, type, COALESCE(species, ''))`.catch(() => {});

  // Global sitter fields and FK constraints are now in the CREATE TABLE above.

  // Backfill species profiles for sitters missing them and set species on services
  await backfillSpeciesProfiles(sql).catch((err) => {
    logger.error({ err }, 'Failed to backfill species profiles');
  });

  // Slug migration (sequential → random hex) already completed — removed.

  // Seed data if empty (dev/test only)
  if (process.env.NODE_ENV === 'production') return;
  const [{ count }] = await sql`SELECT count(*)::int as count FROM users`;
  if (count === 0) {
    logger.info('Seeding database...');
    const demoPassword = await bcrypt.hash('password123', 10);

    const [owner] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng)
      VALUES (${'owner@example.com'}, ${demoPassword}, ${'Alice Owner'}, ${['owner']}, ${'I love my dog!'}, ${'https://i.pravatar.cc/150?u=alice'}, ${40.7128}, ${-73.9960})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, medical_history, photo_url)
      VALUES (${owner.id}, ${'Buddy'}, ${'dog'}, ${'Golden Retriever'}, ${3}, ${30}, ${'male'}, ${true}, ${'high'}, ${true}, ${['friendly', 'playful', 'good_with_dogs']}, ${'None'}, ${'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80'})
    `;

    const [sitter] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, skills)
      VALUES (${'sitter@example.com'}, ${demoPassword}, ${'Bob Sitter'}, ${['owner', 'sitter']}, ${'Experienced dog walker and sitter.'}, ${'https://i.pravatar.cc/150?u=bob'}, ${40.7135}, ${-73.9945}, ${['small', 'medium', 'large']}, ${['dog', 'cat']}, ${5}, ${'house'}, ${true}, ${true}, ${['pet_first_aid', 'dog_training']})
      RETURNING id
    `;
    await sql`INSERT INTO services (sitter_id, type, price_cents, description) VALUES (${sitter.id}, ${'walking'}, ${2500}, ${'30 minute walk around the neighborhood.'})`;
    await sql`INSERT INTO services (sitter_id, type, price_cents, description) VALUES (${sitter.id}, ${'sitting'}, ${5000}, ${'Overnight sitting at your home.'})`;

    const [dual] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes)
      VALUES (${'dual@example.com'}, ${demoPassword}, ${'Charlie Dual'}, ${['owner', 'sitter']}, ${'I walk dogs and have a cat.'}, ${'https://i.pravatar.cc/150?u=charlie'}, ${40.7150}, ${-73.9980}, ${['small', 'medium', 'large', 'giant']})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, medical_history, photo_url)
      VALUES (${dual.id}, ${'Mittens'}, ${'cat'}, ${'Tabby Cat'}, ${5}, ${5}, ${'female'}, ${true}, ${'low'}, ${true}, ${['calm', 'independent']}, ${'Allergic to fish-based foods'}, ${'Allergic to fish'}, ${'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80'})
    `;
    await sql`INSERT INTO services (sitter_id, type, price_cents, description) VALUES (${dual.id}, ${'drop-in'}, ${2000}, ${'Quick check-in and feeding.'})`;

    // Seed 10 additional sitter profiles for testing ranking
    const sitters = [
      { email: 'sarah@example.com', name: 'Sarah Martinez', bio: 'Certified dog trainer with 10 years experience. I treat every pet like family.', avatar: 'https://i.pravatar.cc/150?u=sarah', lat: 40.7110, lng: -73.9935, species: ['dog', 'cat'], sizes: ['small', 'medium', 'large'], experience: 10, home: 'house', yard: true, fenced: true, skills: ['pet_first_aid', 'dog_training', 'behavioral_issues'], services: [{ type: 'walking', price: 35, desc: 'Professional 45-min training walk' }, { type: 'sitting', price: 65, desc: 'In-home overnight care with enrichment' }] },
      { email: 'mike@example.com', name: 'Mike Chen', bio: 'College student who loves animals. Available weekdays!', avatar: 'https://i.pravatar.cc/150?u=mike', lat: 40.7120, lng: -73.9925, species: ['dog'], sizes: ['small', 'medium'], experience: 1, home: 'apartment', yard: false, fenced: false, skills: [], services: [{ type: 'walking', price: 15, desc: 'Budget-friendly 30-min walk' }] },
      { email: 'emma@example.com', name: 'Emma Thompson', bio: 'Retired vet tech. Specializing in senior pets and pets with medical needs.', avatar: 'https://i.pravatar.cc/150?u=emma', lat: 40.7155, lng: -73.9990, species: ['dog', 'cat', 'bird', 'reptile', 'small_animal'], sizes: ['small', 'medium', 'large', 'giant'], experience: 15, home: 'house', yard: true, fenced: true, skills: ['pet_first_aid', 'medication_admin', 'senior_pet_care'], services: [{ type: 'sitting', price: 75, desc: 'Medical-grade overnight care' }, { type: 'drop-in', price: 30, desc: 'Med admin and wellness check' }] },
      { email: 'james@example.com', name: 'James Wilson', bio: 'Professional dog walker. 5 star rating on Rover with 200+ walks completed.', avatar: 'https://i.pravatar.cc/150?u=james', lat: 40.7140, lng: -73.9950, species: ['dog'], sizes: ['medium', 'large', 'giant'], experience: 4, home: 'house', yard: true, fenced: false, skills: ['dog_training'], services: [{ type: 'walking', price: 28, desc: 'Energetic 1-hour adventure walk' }, { type: 'sitting', price: 55, desc: 'Comfortable home boarding' }] },
      { email: 'lisa@example.com', name: 'Lisa Park', bio: 'Cat whisperer! Former shelter volunteer. Your kitty will be in great hands.', avatar: 'https://i.pravatar.cc/150?u=lisa', lat: 40.7115, lng: -73.9970, species: ['cat', 'small_animal'], sizes: ['small', 'medium'], experience: 6, home: 'condo', yard: false, fenced: false, skills: ['medication_admin', 'senior_pet_care'], services: [{ type: 'sitting', price: 40, desc: 'Cat-specialized in-home sitting' }, { type: 'drop-in', price: 18, desc: 'Quick visit with playtime' }] },
      { email: 'david@example.com', name: 'David Rodriguez', bio: 'Dog lover and marathon runner. Your pup will get plenty of exercise!', avatar: 'https://i.pravatar.cc/150?u=david', lat: 40.7105, lng: -73.9915, species: ['dog'], sizes: ['medium', 'large'], experience: 3, home: 'apartment', yard: false, fenced: false, skills: ['dog_training', 'puppy_care'], services: [{ type: 'walking', price: 22, desc: 'High-energy running walk for active dogs' }] },
      { email: 'nina@example.com', name: 'Nina Patel', bio: 'Grooming professional with 8 years in the industry. Gentle touch guaranteed.', avatar: 'https://i.pravatar.cc/150?u=nina', lat: 40.7148, lng: -73.9940, species: ['dog', 'cat'], sizes: ['small', 'medium', 'large'], experience: 8, home: 'house', yard: true, fenced: true, skills: ['grooming_basics', 'pet_first_aid'], services: [{ type: 'grooming', price: 45, desc: 'Full grooming: bath, nail trim, haircut' }, { type: 'walking', price: 20, desc: 'Gentle neighborhood stroll' }] },
      { email: 'tom@example.com', name: 'Tom Baker', bio: 'New to pet sitting but passionate about animals. Great references available!', avatar: 'https://i.pravatar.cc/150?u=tom', lat: 40.7125, lng: -73.9965, species: ['dog', 'cat'], sizes: ['small', 'medium'], experience: 0, home: 'apartment', yard: false, fenced: false, skills: [], services: [{ type: 'walking', price: 12, desc: 'Affordable daily walks' }, { type: 'drop-in', price: 15, desc: 'Check-in and feeding visit' }] },
      { email: 'rachel@example.com', name: 'Rachel Kim', bio: 'Experienced with anxious and reactive dogs. Calm, patient approach.', avatar: 'https://i.pravatar.cc/150?u=rachel', lat: 40.7145, lng: -73.9948, species: ['dog'], sizes: ['small', 'medium', 'large'], experience: 7, home: 'house', yard: true, fenced: true, skills: ['behavioral_issues', 'dog_training', 'medication_admin'], services: [{ type: 'walking', price: 32, desc: 'Reactive dog specialist walk' }, { type: 'sitting', price: 60, desc: 'Calm home environment for anxious pups' }] },
      { email: 'alex@example.com', name: 'Alex Rivera', bio: 'Exotic pet specialist! Experienced with birds, reptiles, and small animals.', avatar: 'https://i.pravatar.cc/150?u=alex', lat: 40.7122, lng: -73.9980, species: ['bird', 'reptile', 'small_animal'], sizes: ['small'], experience: 5, home: 'house', yard: false, fenced: false, skills: ['medication_admin'], services: [{ type: 'sitting', price: 35, desc: 'Specialized exotic pet care' }, { type: 'drop-in', price: 22, desc: 'Feeding and habitat maintenance' }] },
    ];

    for (const s of sitters) {
      const [u] = await sql`
        INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, skills)
        VALUES (${s.email}, ${demoPassword}, ${s.name}, ${['owner', 'sitter']}, ${s.bio}, ${s.avatar}, ${s.lat}, ${s.lng}, ${s.sizes}, ${s.species}, ${s.experience}, ${s.home}, ${s.yard}, ${s.fenced}, ${s.skills})
        RETURNING id
      `;
      for (const svc of s.services) {
        await sql`INSERT INTO services (sitter_id, type, price_cents, description) VALUES (${u.id}, ${svc.type}, ${Math.round(svc.price * 100)}, ${svc.desc})`;
      }
    }

    logger.info('Database seeded with 13 users (1 owner-only, 12 owner+sitter)');

    // Backfill species profiles for freshly seeded sitters
    await backfillSpeciesProfiles(sql).catch((err) => {
      logger.error({ err }, 'Failed to backfill species profiles for seeded data');
    });
  }
}

export default sql;
