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
      CREATE TYPE service_type AS ENUM ('walking', 'sitting', 'drop-in', 'grooming');
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
      walk_updates BOOLEAN DEFAULT TRUE
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

  // Performance indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_owner_id ON bookings (owner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_sitter_id ON bookings (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_sitter_id ON services (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews (reviewee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_availability_sitter_id ON availability (sitter_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_walk_events_booking_id ON walk_events (booking_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_verifications_sitter_id ON verifications (sitter_id)`;

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
      INSERT INTO pets (owner_id, name, breed, age, weight, medical_history, photo_url)
      VALUES (${owner.id}, ${'Buddy'}, ${'Golden Retriever'}, ${3}, ${30}, ${'None'}, ${'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80'})
    `;

    const [sitter] = await sql`
      INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng)
      VALUES (${'sitter@example.com'}, ${demoPassword}, ${'Bob Sitter'}, ${'sitter'}, ${'Experienced dog walker and sitter.'}, ${'https://i.pravatar.cc/150?u=bob'}, ${37.7750}, ${-122.4180})
      RETURNING id
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'walking'}, ${25}, ${'30 minute walk around the neighborhood.'})`;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${sitter.id}, ${'sitting'}, ${50}, ${'Overnight sitting at your home.'})`;

    const [dual] = await sql`
      INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng)
      VALUES (${'dual@example.com'}, ${demoPassword}, ${'Charlie Dual'}, ${'both'}, ${'I walk dogs and have a cat.'}, ${'https://i.pravatar.cc/150?u=charlie'}, ${37.7760}, ${-122.4200})
      RETURNING id
    `;
    await sql`
      INSERT INTO pets (owner_id, name, breed, age, weight, medical_history, photo_url)
      VALUES (${dual.id}, ${'Mittens'}, ${'Tabby Cat'}, ${5}, ${5}, ${'Allergic to fish'}, ${'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80'})
    `;
    await sql`INSERT INTO services (sitter_id, type, price, description) VALUES (${dual.id}, ${'drop-in'}, ${20}, ${'Quick check-in and feeding.'})`;

    console.log('Database seeded!');
  }
}

export default sql;
