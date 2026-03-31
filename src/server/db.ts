import postgres from 'postgres';
import bcrypt from 'bcryptjs';

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
  await sql`
    DO $$ BEGIN
      CREATE TYPE service_type AS ENUM ('walking', 'sitting', 'drop-in', 'grooming', 'meet_greet');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE walk_event_type AS ENUM ('start', 'pee', 'poop', 'photo', 'end', 'fed', 'water', 'medication', 'nap_start', 'nap_end', 'play', 'video');
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
      CREATE TYPE notification_type AS ENUM ('new_booking', 'booking_status', 'new_message', 'walk_started', 'walk_completed', 'payment_update', 'verification_update', 'account_update', 'care_task_reminder');
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
      approval_status TEXT DEFAULT 'approved' CHECK(approval_status IN ('approved', 'pending_approval', 'rejected', 'banned')),
      approval_rejected_reason TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      accepted_pet_sizes TEXT[] DEFAULT '{}',
      accepted_species TEXT[] DEFAULT '{}',
      cancellation_policy cancellation_policy DEFAULT 'flexible',
      years_experience INTEGER,
      home_type TEXT,
      has_yard BOOLEAN DEFAULT false,
      has_fenced_yard BOOLEAN DEFAULT false,
      has_own_pets BOOLEAN DEFAULT false,
      own_pets_description TEXT,
      skills TEXT[] DEFAULT '{}',
      service_radius_miles INTEGER DEFAULT 10,
      max_pets_at_once INTEGER DEFAULT 3,
      max_pets_per_walk INTEGER DEFAULT 2,
      house_rules TEXT,
      emergency_procedures TEXT,
      has_insurance BOOLEAN DEFAULT false,
      email_verified BOOLEAN DEFAULT false,
      is_pro BOOLEAN DEFAULT false,
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
      price DOUBLE PRECISION NOT NULL,
      description TEXT,
      additional_pet_price DOUBLE PRECISION DEFAULT 0,
      max_pets INTEGER DEFAULT 1,
      service_details JSONB
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      pet_id INTEGER REFERENCES pets(id),
      service_id INTEGER REFERENCES services(id),
      status booking_status DEFAULT 'pending',
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      total_price DOUBLE PRECISION,
      payment_intent_id TEXT,
      payment_status payment_status DEFAULT 'pending',
      payment_method TEXT DEFAULT 'card' CHECK(payment_method IN ('card', 'ach_debit')),
      payment_failure_reason TEXT,
      responded_at TIMESTAMPTZ,
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
      amount DOUBLE PRECISION NOT NULL,
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

  // Seed data if empty (dev/test only)
  if (process.env.NODE_ENV === 'production') return;
  const [{ count }] = await sql`SELECT count(*)::int as count FROM users`;
  if (count === 0) {
    console.log('Seeding database...');
    const demoPassword = bcrypt.hashSync('password123', 10);

    const [owner] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng)
      VALUES (${'owner@example.com'}, ${demoPassword}, ${'Alice Owner'}, ${['owner']}, ${'I love my dog!'}, ${'https://i.pravatar.cc/150?u=alice'}, ${37.7749}, ${-122.4194})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, medical_history, photo_url)
      VALUES (${owner.id}, ${'Buddy'}, ${'dog'}, ${'Golden Retriever'}, ${3}, ${30}, ${'male'}, ${true}, ${'high'}, ${true}, ${['friendly', 'playful', 'good_with_dogs']}, ${'None'}, ${'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80'})
    `;

    const [sitter] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, skills)
      VALUES (${'sitter@example.com'}, ${demoPassword}, ${'Bob Sitter'}, ${['owner', 'sitter']}, ${'Experienced dog walker and sitter.'}, ${'https://i.pravatar.cc/150?u=bob'}, ${37.7750}, ${-122.4180}, ${['small', 'medium', 'large']}, ${['dog', 'cat']}, ${5}, ${'house'}, ${true}, ${true}, ${['pet_first_aid', 'dog_training']})
      RETURNING id
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'walking'}, ${25}, ${'30 minute walk around the neighborhood.'})`;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'sitting'}, ${50}, ${'Overnight sitting at your home.'})`;

    const [dual] = await sql`
      INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes)
      VALUES (${'dual@example.com'}, ${demoPassword}, ${'Charlie Dual'}, ${['owner', 'sitter']}, ${'I walk dogs and have a cat.'}, ${'https://i.pravatar.cc/150?u=charlie'}, ${37.7760}, ${-122.4200}, ${['small', 'medium', 'large', 'giant']})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, medical_history, photo_url)
      VALUES (${dual.id}, ${'Mittens'}, ${'cat'}, ${'Tabby Cat'}, ${5}, ${5}, ${'female'}, ${true}, ${'low'}, ${true}, ${['calm', 'independent']}, ${'Allergic to fish-based foods'}, ${'Allergic to fish'}, ${'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80'})
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${dual.id}, ${'drop-in'}, ${20}, ${'Quick check-in and feeding.'})`;

    // Seed 10 additional sitter profiles for testing ranking
    const sitters = [
      { email: 'sarah@example.com', name: 'Sarah Martinez', bio: 'Certified dog trainer with 10 years experience. I treat every pet like family.', avatar: 'https://i.pravatar.cc/150?u=sarah', lat: 37.7735, lng: -122.4165, species: ['dog', 'cat'], sizes: ['small', 'medium', 'large'], experience: 10, home: 'house', yard: true, fenced: true, skills: ['pet_first_aid', 'dog_training', 'behavioral_issues'], services: [{ type: 'walking', price: 35, desc: 'Professional 45-min training walk' }, { type: 'sitting', price: 65, desc: 'In-home overnight care with enrichment' }] },
      { email: 'mike@example.com', name: 'Mike Chen', bio: 'College student who loves animals. Available weekdays!', avatar: 'https://i.pravatar.cc/150?u=mike', lat: 37.7742, lng: -122.4155, species: ['dog'], sizes: ['small', 'medium'], experience: 1, home: 'apartment', yard: false, fenced: false, skills: [], services: [{ type: 'walking', price: 15, desc: 'Budget-friendly 30-min walk' }] },
      { email: 'emma@example.com', name: 'Emma Thompson', bio: 'Retired vet tech. Specializing in senior pets and pets with medical needs.', avatar: 'https://i.pravatar.cc/150?u=emma', lat: 37.7768, lng: -122.4210, species: ['dog', 'cat', 'bird', 'reptile', 'small_animal'], sizes: ['small', 'medium', 'large', 'giant'], experience: 15, home: 'house', yard: true, fenced: true, skills: ['pet_first_aid', 'medication_admin', 'senior_pet_care'], services: [{ type: 'sitting', price: 75, desc: 'Medical-grade overnight care' }, { type: 'drop-in', price: 30, desc: 'Med admin and wellness check' }] },
      { email: 'james@example.com', name: 'James Wilson', bio: 'Professional dog walker. 5 star rating on Rover with 200+ walks completed.', avatar: 'https://i.pravatar.cc/150?u=james', lat: 37.7755, lng: -122.4175, species: ['dog'], sizes: ['medium', 'large', 'giant'], experience: 4, home: 'house', yard: true, fenced: false, skills: ['dog_training'], services: [{ type: 'walking', price: 28, desc: 'Energetic 1-hour adventure walk' }, { type: 'sitting', price: 55, desc: 'Comfortable home boarding' }] },
      { email: 'lisa@example.com', name: 'Lisa Park', bio: 'Cat whisperer! Former shelter volunteer. Your kitty will be in great hands.', avatar: 'https://i.pravatar.cc/150?u=lisa', lat: 37.7740, lng: -122.4190, species: ['cat', 'small_animal'], sizes: ['small', 'medium'], experience: 6, home: 'condo', yard: false, fenced: false, skills: ['medication_admin', 'senior_pet_care'], services: [{ type: 'sitting', price: 40, desc: 'Cat-specialized in-home sitting' }, { type: 'drop-in', price: 18, desc: 'Quick visit with playtime' }] },
      { email: 'david@example.com', name: 'David Rodriguez', bio: 'Dog lover and marathon runner. Your pup will get plenty of exercise!', avatar: 'https://i.pravatar.cc/150?u=david', lat: 37.7730, lng: -122.4145, species: ['dog'], sizes: ['medium', 'large'], experience: 3, home: 'apartment', yard: false, fenced: false, skills: ['dog_training', 'puppy_care'], services: [{ type: 'walking', price: 22, desc: 'High-energy running walk for active dogs' }] },
      { email: 'nina@example.com', name: 'Nina Patel', bio: 'Grooming professional with 8 years in the industry. Gentle touch guaranteed.', avatar: 'https://i.pravatar.cc/150?u=nina', lat: 37.7762, lng: -122.4160, species: ['dog', 'cat'], sizes: ['small', 'medium', 'large'], experience: 8, home: 'house', yard: true, fenced: true, skills: ['grooming_basics', 'pet_first_aid'], services: [{ type: 'grooming', price: 45, desc: 'Full grooming: bath, nail trim, haircut' }, { type: 'walking', price: 20, desc: 'Gentle neighborhood stroll' }] },
      { email: 'tom@example.com', name: 'Tom Baker', bio: 'New to pet sitting but passionate about animals. Great references available!', avatar: 'https://i.pravatar.cc/150?u=tom', lat: 37.7748, lng: -122.4185, species: ['dog', 'cat'], sizes: ['small', 'medium'], experience: 0, home: 'apartment', yard: false, fenced: false, skills: [], services: [{ type: 'walking', price: 12, desc: 'Affordable daily walks' }, { type: 'drop-in', price: 15, desc: 'Check-in and feeding visit' }] },
      { email: 'rachel@example.com', name: 'Rachel Kim', bio: 'Experienced with anxious and reactive dogs. Calm, patient approach.', avatar: 'https://i.pravatar.cc/150?u=rachel', lat: 37.7758, lng: -122.4170, species: ['dog'], sizes: ['small', 'medium', 'large'], experience: 7, home: 'house', yard: true, fenced: true, skills: ['behavioral_issues', 'dog_training', 'medication_admin'], services: [{ type: 'walking', price: 32, desc: 'Reactive dog specialist walk' }, { type: 'sitting', price: 60, desc: 'Calm home environment for anxious pups' }] },
      { email: 'alex@example.com', name: 'Alex Rivera', bio: 'Exotic pet specialist! Experienced with birds, reptiles, and small animals.', avatar: 'https://i.pravatar.cc/150?u=alex', lat: 37.7745, lng: -122.4200, species: ['bird', 'reptile', 'small_animal'], sizes: ['small'], experience: 5, home: 'house', yard: false, fenced: false, skills: ['medication_admin'], services: [{ type: 'sitting', price: 35, desc: 'Specialized exotic pet care' }, { type: 'drop-in', price: 22, desc: 'Feeding and habitat maintenance' }] },
    ];

    for (const s of sitters) {
      const [u] = await sql`
        INSERT INTO users (email, password_hash, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, skills)
        VALUES (${s.email}, ${demoPassword}, ${s.name}, ${['owner', 'sitter']}, ${s.bio}, ${s.avatar}, ${s.lat}, ${s.lng}, ${s.sizes}, ${s.species}, ${s.experience}, ${s.home}, ${s.yard}, ${s.fenced}, ${s.skills})
        RETURNING id
      `;
      for (const svc of s.services) {
        await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${u.id}, ${svc.type}, ${svc.price}, ${svc.desc})`;
      }
    }

    console.log('Database seeded with 13 users (1 owner-only, 12 owner+sitter)!');
  }
}

export default sql;
