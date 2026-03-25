import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/petlink';

const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function initDb() {
  // Enable PostGIS if available (ignore error if extension not installed)
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`.catch(() => {});

  await sql`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('owner', 'sitter', 'both');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `;
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
      CREATE TYPE walk_event_type AS ENUM ('start', 'pee', 'poop', 'photo', 'end');
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
      CREATE TYPE notification_type AS ENUM ('new_booking', 'booking_status', 'new_message', 'walk_started', 'walk_completed');
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
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'owner',
      bio TEXT,
      avatar_url TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      location GEOGRAPHY(Point, 4326),
      stripe_account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pets (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      breed TEXT,
      age INTEGER,
      weight DOUBLE PRECISION,
      medical_history TEXT,
      photo_url TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type service_type NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      description TEXT
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

  // Create spatial index on users.location if PostGIS is available
  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST (location)
  `.catch(() => {});

  // Auto-update location column when lat/lng change
  await sql`
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
  `.catch(() => {});

  await sql`
    DO $$ BEGIN
      CREATE TRIGGER trg_update_user_location
        BEFORE INSERT OR UPDATE OF lat, lng ON users
        FOR EACH ROW EXECUTE FUNCTION update_user_location();
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `.catch(() => {});

  // Schema migrations — add new columns/enums safely
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_pet_sizes TEXT[] DEFAULT '{}'`.catch(() => {});
  await sql`ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'meet_greet'`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS cancellation_policy cancellation_policy DEFAULT 'flexible'`.catch(() => {});
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS additional_pet_price DOUBLE PRECISION DEFAULT 0`.catch(() => {});
  await sql`ALTER TABLE walk_events ADD COLUMN IF NOT EXISTS pet_id INTEGER REFERENCES pets(id)`.catch(() => {});
  await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`.catch(() => {});

  // Issue #109: Granular pet profiles
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS species TEXT DEFAULT 'dog'`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS gender TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS spayed_neutered BOOLEAN`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS energy_level TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS house_trained BOOLEAN`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS temperament TEXT[] DEFAULT '{}'`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS special_needs TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS microchip_number TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS vet_name TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS vet_phone TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`.catch(() => {});
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`.catch(() => {});

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

  // Issue #109: Sitter profile details
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_species TEXT[] DEFAULT '{}'`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS years_experience INTEGER`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_type TEXT`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_yard BOOLEAN DEFAULT false`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_fenced_yard BOOLEAN DEFAULT false`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_own_pets BOOLEAN DEFAULT false`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS own_pets_description TEXT`.catch(() => {});
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}'`.catch(() => {});

  // Issue #109: Service details
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS max_pets INTEGER DEFAULT 1`.catch(() => {});
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS service_details JSONB`.catch(() => {});

  // Issue #100: Pet care instructions
  await sql`ALTER TABLE pets ADD COLUMN IF NOT EXISTS care_instructions JSONB DEFAULT '[]'`.catch(() => {});

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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_care_tasks_booking_id ON booking_care_tasks (booking_id)`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_booking_care_tasks_pet_id ON booking_care_tasks (pet_id)`.catch(() => {});

  // Seed data if empty (dev/test only)
  if (process.env.NODE_ENV === 'production') return;
  const [{ count }] = await sql`SELECT count(*)::int as count FROM users`;
  if (count === 0) {
    console.log('Seeding database...');
    const demoPassword = bcrypt.hashSync('password123', 10);

    const [owner] = await sql`
      INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng)
      VALUES (${'owner@example.com'}, ${demoPassword}, ${'Alice Owner'}, ${'owner'}, ${'I love my dog!'}, ${'https://i.pravatar.cc/150?u=alice'}, ${37.7749}, ${-122.4194})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, medical_history, photo_url)
      VALUES (${owner.id}, ${'Buddy'}, ${'dog'}, ${'Golden Retriever'}, ${3}, ${30}, ${'male'}, ${true}, ${'high'}, ${true}, ${['friendly', 'playful', 'good_with_dogs']}, ${'None'}, ${'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80'})
    `;

    const [sitter] = await sql`
      INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, skills)
      VALUES (${'sitter@example.com'}, ${demoPassword}, ${'Bob Sitter'}, ${'sitter'}, ${'Experienced dog walker and sitter.'}, ${'https://i.pravatar.cc/150?u=bob'}, ${37.7750}, ${-122.4180}, ${['small', 'medium', 'large']}, ${['dog', 'cat']}, ${5}, ${'house'}, ${true}, ${true}, ${['pet_first_aid', 'dog_training']})
      RETURNING id
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'walking'}, ${25}, ${'30 minute walk around the neighborhood.'})`;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'sitting'}, ${50}, ${'Overnight sitting at your home.'})`;

    const [dual] = await sql`
      INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng, accepted_pet_sizes)
      VALUES (${'dual@example.com'}, ${demoPassword}, ${'Charlie Dual'}, ${'both'}, ${'I walk dogs and have a cat.'}, ${'https://i.pravatar.cc/150?u=charlie'}, ${37.7760}, ${-122.4200}, ${['small', 'medium', 'large', 'giant']})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, medical_history, photo_url)
      VALUES (${dual.id}, ${'Mittens'}, ${'cat'}, ${'Tabby Cat'}, ${5}, ${5}, ${'female'}, ${true}, ${'low'}, ${true}, ${['calm', 'independent']}, ${'Allergic to fish-based foods'}, ${'Allergic to fish'}, ${'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80'})
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${dual.id}, ${'drop-in'}, ${20}, ${'Quick check-in and feeding.'})`;

    console.log('Database seeded!');
  }
}

export default sql;
