# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PetLink — a pet services marketplace (Rover clone). React 19 + Express + PostgreSQL (PostGIS) + Socket.io + Stripe Connect. Monorepo with frontend and backend in the same package.

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

- **Database**: PostgreSQL via `postgres` (porsager), schema in `src/db.ts`. PostGIS for geo queries.
- **Auth**: JWT + bcrypt (`src/auth.ts`). Bearer tokens in `Authorization` header. Async middleware validates token + user existence. OAuth sign-in via Google, Apple, Facebook (`src/oauth.ts`). OAuth-only users have `password_hash = NULL`.
- **Payments**: Stripe Connect escrow (`src/payments.ts`). Manual capture for hold/release flow.
- **Notifications**: In-app + real-time via Socket.io (`src/notifications.ts`). Per-user preferences.
- **Storage**: S3-compatible signed URL uploads (`src/storage.ts`). Supports AWS S3 and MinIO.
- **Rate limiting**: 100 req/15min API, 20 req/15min auth endpoints, 30 req/15min public endpoints. Rate limiters in `src/rate-limit.ts`.
- **Bot protection**: `robots.txt` disallows `/api/`, `X-Robots-Tag` header on all API responses, bot UA detection middleware on public endpoints (`src/bot-detection.ts`). Public endpoints (sitter search/profile, reviews, availability, photos, verification) have stricter rate limits and bot blocking.

### API Routes (all under `/api/v1/`, also mounted at `/api/` for backwards compat)

| Domain | Endpoints |
|--------|-----------|
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/oauth`, `GET /auth/me`, `GET /auth/linked-accounts`, `DELETE /auth/linked-accounts/:provider`, `POST /auth/set-password` |
| Users | `PUT /users/me` |
| Pets | `GET/POST /pets`, `PUT/DELETE /pets/:id` |
| Sitters | `GET /sitters` (with optional `?serviceType=&lat=&lng=&radius=&minPrice=&maxPrice=&petSize=`), `GET /sitters/:id` |
| Services | `GET /services/me`, `POST /services`, `PUT /services/:id`, `DELETE /services/:id` |
| Bookings | `POST /bookings` (with `pet_ids` array), `GET /bookings` (includes `pets` array), `PUT /bookings/:id/status` |
| Messages | `GET /conversations`, `GET /messages/:userId` (marks messages read) |
| Reviews | `POST /reviews` (double-blind), `GET /reviews/:userId` |
| Verification | `GET /verification/me`, `POST /verification/start`, `PUT /verification/update`, `GET /verification/:sitterId` |
| Availability | `GET /availability/:sitterId`, `POST /availability`, `DELETE /availability/:id` |
| Sitter Photos | `GET /sitter-photos/:sitterId`, `POST /sitter-photos`, `PUT/DELETE /sitter-photos/:id` |
| Favorites | `GET /favorites`, `POST /favorites/:sitterId`, `DELETE /favorites/:sitterId` |
| Cancellation Policy | `GET /cancellation-policy`, `PUT /cancellation-policy` |
| Walk Events | `GET/POST /walks/:bookingId/events` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET/PUT /notification-preferences` |
| Payments | `POST /stripe/connect`, `POST /stripe/account-link`, `POST /payments/create-intent`, `POST /payments/capture`, `POST /payments/cancel` |
| Uploads | `POST /uploads/signed-url` |
| Webhooks | `POST /webhooks/stripe`, `POST /webhooks/background-check` |
| Health | `GET /health` (no auth, returns DB connectivity status) |

### Frontend (`src/`)

React 19 SPA with react-router-dom v7, styled with Tailwind CSS v4.

- **Entry**: `src/main.tsx` → `src/App.tsx` (router) → `src/components/Layout.tsx` (shell)
- **Auth state**: `src/context/AuthContext.tsx` — React context + localStorage (`petlink_token`, `petlink_user`)
- **Pages**: Home, Login, Search, SitterProfile, Dashboard (mode-aware booking filtering), Messages, TrackWalk, ProfilePage (sidebar + stacked sections: owner mode shows ProfileTab+PetsTab, sitter mode shows ProfileTab+ServicesTab+PhotosTab), Onboarding. Old routes `/pets`, `/services`, `/photos` redirect to `/profile`.
- **Mode system**: `ModeContext` provides global owner/sitter toggle for "both" role users. Persisted in localStorage (`petlink_mode`). Affects Dashboard filtering, Profile sections, and onboarding visibility. `ModeToggle` component in header.
- **Components**: `BookingCalendar` (month-grid date picker with availability), `TimeSlotPicker` (time slot selection from availability windows), `PhotoGallery` (lightbox viewer), `FavoriteButton` (heart toggle), `FavoriteSitters` (dashboard favorites section), `PetSelector` (multi-pet checkbox selection for bookings)
- **Hooks**: `useFavorites` (favorites state + optimistic toggle), `useOnboardingStatus`, `useImageUpload`
- **Types**: `src/types.ts` — User, Pet, Service, Booking, Message, Review, Availability, WalkEvent, SitterPhoto, Favorite, CancellationPolicy
- **Path alias**: `@/*` maps to project root

### Database Schema (`src/db.ts`)

PostgreSQL with PostGIS. Tables: `users` (with `location` geography column, nullable `password_hash` for OAuth-only users, `email_verified` boolean), `pets`, `services` (with `additional_pet_price`), `bookings`, `booking_pets` (junction table for multi-pet bookings), `messages`, `reviews`, `availability`, `walk_events` (with optional `pet_id`), `verifications`, `notifications`, `notification_preferences`, `push_subscriptions`, `sitter_photos`, `favorites`, `oauth_accounts` (provider links with `provider`, `provider_id`, unique constraints).

PostgreSQL enums: `user_role`, `booking_status`, `payment_status`, `service_type`, `walk_event_type`, `id_check_status`, `bg_check_status`, `notification_type`, `push_platform`, `cancellation_policy`.

Auto-seeded with 3 demo accounts on empty DB: `owner@example.com`, `sitter@example.com`, `dual@example.com` (password: `password123`).

### Key Libraries

- `date-fns` v4 — date formatting (see `docs/DATETIME_GUIDE.md`)
- `lucide-react` — icons
- `motion` — animations (Framer Motion v12)
- `shadcn/ui` — accessible UI components (Button, Card, Badge, Alert, AlertDialog, Avatar, Input, Textarea, Dialog, Select, Tabs)
- `clsx` + `tailwind-merge` — conditional class composition (via `cn()` in `lib/utils.ts`)
- `postgres` — PostgreSQL driver (tagged template literals)
- `stripe` — Stripe Connect payments
- `resend` — transactional email via Resend API (`src/email.ts`)
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3 uploads

## Testing

216 tests across 19 suites (Vitest, 96%+ backend source coverage). See `DEVELOPMENT.md` for full testing guide.

## Guides

- **Date/time handling**: `docs/DATETIME_GUIDE.md`
- **Validation strategy**: `docs/VALIDATION_GUIDE.md`
- **Development practices**: `DEVELOPMENT.md`

## Design System

- **Colors**: Emerald primary, Stone neutrals, Amber/Red accents
- **Patterns**: Cards with `rounded-2xl shadow-sm`, status badges with color mapping, responsive grids
- **Mobile-first**: Tailwind responsive breakpoints (`md:`, `lg:`)
