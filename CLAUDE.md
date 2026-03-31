# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PetLink — a pet services marketplace (Rover clone). React 19 + Express + PostgreSQL (PostGIS) + Socket.io + Stripe. Monorepo with frontend and backend in the same package.

## Commands

```bash
npm run dev          # Start dev server (Express + Vite HMR on :3000)
npm run build        # Production build (Vite)
npm run lint         # Type-check (tsc --noEmit)
npm run test         # Run all tests (Vitest)
npm run test:watch   # Watch mode for TDD
npm run clean        # Remove dist/
```

## Architecture

### Backend (`server.ts`)

Single Express server serves both the API and Vite-powered frontend in dev mode. Socket.io attached to the same HTTP server for real-time messaging and notifications.

- **Database**: PostgreSQL via `postgres` (porsager), schema in `src/server/db.ts`. All tables live in a dedicated `petlink` schema (configurable via `DB_SCHEMA` env var). PostGIS extension also installed in the `petlink` schema. Connection `search_path` set to `petlink` only — no `public`.
- **Auth**: JWT + bcrypt (`src/server/auth.ts`). Bearer tokens in `Authorization` header. Async middleware validates token + user existence. OAuth sign-in via Google, Apple, Facebook (`src/server/oauth.ts`). OAuth-only users have `password_hash = NULL`.
- **Payments**: Direct payment escrow (`src/server/payments.ts`). Manual capture for hold/release flow.
- **Notifications**: In-app + real-time via Socket.io (`src/server/notifications.ts`). Per-user preferences.
- **Storage**: S3-compatible signed URL uploads (`src/server/storage.ts`). Supports AWS S3 and MinIO.
- **Rate limiting**: 100 req/15min API, 20 req/15min auth endpoints, 30 req/15min public endpoints. Rate limiters in `src/server/rate-limit.ts`.
- **Bot protection**: `robots.txt` disallows `/api/`, `X-Robots-Tag` header on all API responses, bot UA detection middleware on public endpoints (`src/server/bot-detection.ts`). Public endpoints (sitter search/profile, reviews, availability, photos, verification) have stricter rate limits and bot blocking.

### API Routes (all under `/api/v1/`, also mounted at `/api/` for backwards compat)

| Domain | Endpoints |
|--------|-----------|
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/oauth`, `GET /auth/me`, `GET /auth/linked-accounts`, `DELETE /auth/linked-accounts/:provider`, `POST /auth/set-password`, `PUT /auth/password` |
| Users | `PUT /users/me` |
| Pets | `GET/POST /pets`, `PUT/DELETE /pets/:id`, `GET/PUT /pets/:id/care-instructions` |
| Pet Vaccinations | `GET /pets/:petId/vaccinations`, `POST /pets/:petId/vaccinations`, `DELETE /pets/:petId/vaccinations/:id` |
| Booking Care Tasks | `GET /bookings/:bookingId/care-tasks`, `PUT /bookings/:bookingId/care-tasks/:taskId/complete`, `PUT /bookings/:bookingId/care-tasks/:taskId/uncomplete`, `GET /care-tasks/today?tzOffset=` |
| Sitters | `GET /sitters` (with optional `?serviceType=&lat=&lng=&radius=&minPrice=&maxPrice=&petSize=&species=`), `GET /sitters/:idOrSlug` (accepts numeric ID or slug) |
| Services | `GET /services/me`, `POST /services`, `PUT /services/:id`, `DELETE /services/:id` |
| Bookings | `POST /bookings` (with `pet_ids` array), `GET /bookings` (includes `pets` array), `PUT /bookings/:id/status` |
| Messages | `GET /conversations`, `GET /messages/:userId` (marks messages read) |
| Reviews | `POST /reviews` (3-day blind window, optional sub-ratings), `GET /reviews/:userId` (auth required), `GET /reviews/booking/:bookingId` (both reviews + can_review/can_respond), `PUT /reviews/:id/respond` |
| Verification | `GET /verification/me`, `POST /verification/start`, `PUT /verification/update`, `GET /verification/:sitterId` |
| Availability | `GET /availability/:sitterId`, `POST /availability`, `DELETE /availability/:id` |
| Sitter Photos | `GET /sitter-photos/:sitterId`, `POST /sitter-photos`, `PUT/DELETE /sitter-photos/:id` |
| Sitter Posts | `GET /sitter-posts/:sitterId` (paginated: `?limit=&offset=`), `POST /sitter-posts`, `DELETE /sitter-posts/:id` |
| Favorites | `GET /favorites`, `POST /favorites/:sitterId`, `DELETE /favorites/:sitterId` |
| Cancellation Policy | `GET /cancellation-policy`, `PUT /cancellation-policy` |
| Walk Events | `GET/POST /walks/:bookingId/events` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET/PUT /notification-preferences` |
| Subscriptions | `GET /subscription`, `POST /subscription/upgrade`, `POST /subscription/cancel` |
| Payouts | `GET /payouts` (paginated: `?limit=&offset=`), `GET /payouts/pending` |
| Payments | `POST /payments/create-intent`, `POST /payments/capture`, `POST /payments/cancel`, `GET /payment-methods`, `DELETE /payment-methods/:id`, `GET /payment-history`, `POST /payments/link-bank`, `GET /payments/bank-accounts`, `DELETE /payments/bank-accounts/:id` |
| Subscriptions | `GET /subscription`, `POST /subscription/upgrade`, `POST /subscription/cancel`, `POST /subscription/create-intent` |
| Analytics | `GET /analytics/overview` (sitter stats by year), `GET /analytics/clients` (client list with pets, paginated), `GET /analytics/clients/:clientId` (client booking history), `GET /analytics/revenue` (weekly/monthly revenue breakdown) |
| Uploads | `POST /uploads/signed-url` |
| Webhooks | `POST /webhooks/stripe`, `POST /webhooks/background-check` |
| Admin | `GET /admin/pending-sitters`, `GET /admin/sitters` (paginated, `?status=&limit=&offset=`), `PUT /admin/sitters/:id/approval` (requires `ADMIN_EMAIL`) |
| Health | `GET /health` (no auth, returns DB connectivity status) |

### Frontend (`src/`)

React 19 SPA with react-router-dom v7, styled with Tailwind CSS v4.

- **Entry**: `src/main.tsx` → `src/App.tsx` (router) → `src/components/layout/Layout.tsx` (shell)
- **Auth state**: `src/context/AuthContext.tsx` — React context + localStorage (`petlink_token`, `petlink_user`)
- **Pages** (organized by feature in `src/pages/`):
  - `auth/` — Login, Onboarding
  - `admin/` — AdminPage (sitter approval management)
  - `home/` — HomePage (bookings, reviews, favorites, onboarding checklist)
  - `search/` — Search, SitterProfile
  - `profile/` — ProfilePage (3-column: nav | edit | preview), ProfileTab, SitterInfoTab, ServicesTab, AvailabilityTab, LocationTab, PhotosTab, PoliciesTab, PetsTab, SubscriptionPage, ImportProfilePage
  - `settings/` — SettingsPage (account, linked accounts, subscription, notifications, delete), PasswordSection, NotificationSection
  - `messages/` — Messages
  - `payments/` — WalletPage, PaymentHistoryPage
  - `sitter/` — AnalyticsPage, PromotePage, TrackWalk
  - `Home.tsx` — landing page
- **Role system**: Additive roles stored as `roles TEXT[]` (default `{owner}`). Roles: `owner`, `sitter`, `admin`. Everyone starts as owner; sitter granted by admin approval; admin requires both DB role and `ADMIN_EMAIL` env var. `ModeContext` provides owner/sitter toggle for users with both roles. Persisted in localStorage (`petlink_mode`). Affects Home page filtering, Profile sections, and onboarding visibility. `ModeToggle` component in header.
- **Components** (organized by domain in `src/components/`):
  - `layout/` — Layout (avatar dropdown: Profile, Settings, Log Out), ModeToggle, MobileMenu
  - `booking/` — BookingCalendar, TimeSlotPicker, PetSelector, CareTasksChecklist, QuickTapLogger
  - `payment/` — PaymentForm, PaymentMethodSelector, SubscriptionPaymentForm, SavedPaymentMethods, BankAccountManager
  - `profile/` — PhotoGallery, FavoriteButton, FavoriteSitters, LinkedAccounts, ImportedReviewBadge, CareInstructionsEditor, SitterPreview, ProfileStrength
  - `home/` — HomeStats, TodaySchedule, NeedsAttention, HomeSidebar
  - `onboarding/` — OnboardingChecklist, OnboardingProgress, OAuthButtons
  - `review/` — SubRatingPills, SubRatingBars, ReviewResponse, ReviewCard, BookingReviewDetail
  - `map/` — SitterClusterMap, SitterLocationMap, MapViewToggle
  - `ui/` — shadcn components
- **Hooks**: `useFavorites`, `useOnboardingStatus`, `useImageUpload`, `useVideoUpload`, `usePaymentIntent`, `useHomeStats`, `useTodaySchedule`, `useSitterPreviewData`
- **Server modules** (`src/server/`): auth, admin, analytics, payments, payouts, notifications, email, storage, validation, profile-import, stripe-customers, slugify, care-task-reminders, etc.
- **Types**: `src/types.ts`
- **Path alias**: `@/*` maps to project root

### Database Schema (`src/server/db.ts`)

PostgreSQL with PostGIS.

| Table | Key Columns / Notes |
|-------|-------------------|
| `users` | `roles TEXT[]` (default `{owner}`, constrained to owner/sitter/admin), `slug` (unique, SEO-friendly URL), `location` geography, nullable `password_hash` (OAuth-only), `email_verified`, `is_pro` (admin-only), `approval_status` (approved/pending_approval/rejected/banned), `approval_rejected_reason`, `approved_by`, `approved_at`, `stripe_customer_id`, sitter fields: `accepted_species`, `accepted_pet_sizes`, `years_experience`, `home_type`, `has_yard`, `has_fenced_yard`, `has_own_pets`, `own_pets_description`, `skills`, `service_radius_miles` (default 10), `max_pets_at_once`, `max_pets_per_walk`, `house_rules`, `emergency_procedures`, `has_insurance` |
| `pets` | `species`, `gender`, `spayed_neutered`, `energy_level`, `house_trained`, `temperament` text[], `special_needs`, `microchip_number`, vet/emergency contacts, `care_instructions` JSONB |
| `pet_vaccinations` | Vaccine records with expiration tracking |
| `services` | `additional_pet_price`, `max_pets`, `service_details` JSONB |
| `bookings` | Links owner, sitter, service with status/payment tracking, `payment_method` (card/ach_debit), `payment_failure_reason` |
| `booking_pets` | Junction table for multi-pet bookings |
| `booking_care_tasks` | Checklist items auto-populated from pet care instructions, `scheduled_time` TIMESTAMPTZ for timeline/notifications, `reminder_sent_at` for dedup |
| `messages` | sender_id, receiver_id, content |
| `reviews` | Double-blind reviews with `published_at` gating, sub-ratings (`pet_care_rating`, `communication_rating`, `reliability_rating`, `pet_accuracy_rating`, `preparedness_rating`), reviewee response (`response_text`, `response_at`) |
| `availability` | Sitter availability windows |
| `walk_events` | GPS tracking, `photo_url`, `video_url`, `video` event type (max 5 clips/booking, 15s/10MB limit) |
| `verifications` | ID check, background check (Checkr integration) |
| `notifications` | In-app notifications with type system |
| `notification_preferences` | Per-user notification settings |
| `push_subscriptions` | Web push subscription storage |
| `sitter_photos` | Portfolio photos with ordering |
| `sitter_posts` | Instagram-style posts with content, photo/video, post type (`update`, `walk_photo`, `walk_video`, `care_update`), optional booking/walk event links |
| `favorites` | Owner favorite sitters |
| `oauth_accounts` | Provider links (`provider`, `provider_id`, unique constraints) |
| `sitter_subscriptions` | Pro tier with status tracking, Stripe billing, billing period |
| `sitter_payouts` | Delayed payout scheduling, `amount_cents` INTEGER, `status` CHECK, unique `booking_id` |

PostgreSQL enums: `booking_status`, `payment_status`, `service_type`, `walk_event_type`, `id_check_status`, `bg_check_status`, `notification_type`, `push_platform`, `cancellation_policy`. User roles use `TEXT[]` (not an enum).

Auto-seeded with 3 demo accounts on empty DB: `owner@example.com` (owner only), `sitter@example.com` (owner+sitter), `dual@example.com` (owner+sitter) (password: `password123`).

### Key Libraries

- `date-fns` v4 — date formatting (see `docs/DATETIME_GUIDE.md`)
- `lucide-react` — icons
- `motion` — animations (Framer Motion v12)
- `shadcn/ui` — accessible UI components (Button, Card, Badge, Alert, AlertDialog, Avatar, Input, Textarea, Dialog, Select, Tabs)
- `clsx` + `tailwind-merge` — conditional class composition (via `cn()` in `lib/utils.ts`)
- `postgres` — PostgreSQL driver (tagged template literals)
- `stripe` — Stripe payments (backend)
- `@stripe/stripe-js` + `@stripe/react-stripe-js` — Stripe Elements for embedded payment forms
- `resend` — transactional email via Resend API (`src/server/email.ts`)
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3 uploads
- `leaflet` + `react-leaflet` — interactive maps with OpenStreetMap tiles (`src/components/map/`)
- `leaflet.markercluster` — marker clustering for search results map

## Testing

330 tests across 25 suites (Vitest, 96%+ backend source coverage). See `DEVELOPMENT.md` for full testing guide.

## Guides

- **Date/time handling**: `docs/DATETIME_GUIDE.md`
- **Validation strategy**: `docs/VALIDATION_GUIDE.md`
- **Development practices**: `DEVELOPMENT.md`
- **Business docs** (confidential, separate repo): `/Users/mshen/repos/mapshen/petlink-business/docs/` — contains BUSINESS_PLAN.md, BUSINESS_CANVAS.md, COMPETITOR_ANALYSIS.md

## Design System

- **Colors**: Emerald primary, Stone neutrals, Amber/Red accents
- **Patterns**: Cards with `rounded-2xl shadow-sm`, status badges with color mapping, responsive grids
- **Mobile-first**: Tailwind responsive breakpoints (`md:`, `lg:`)
