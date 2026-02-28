# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PetLink — a pet services marketplace (Rover clone). React 19 + Express + PostgreSQL (PostGIS) + Socket.io + Stripe Connect. Monorepo with frontend and backend in the same package.

## Commands

```bash
npm run dev          # Start dev server (Express + Vite HMR on :3000)
npm run build        # Production build (Vite)
npm run lint         # Type-check (tsc --noEmit)
npm run test         # Run all 21 tests (Vitest)
npm run test:watch   # Watch mode for TDD
npm run clean        # Remove dist/
```

## Architecture

### Backend (`server.ts`)

Single Express server serves both the API and Vite-powered frontend in dev mode. Socket.io attached to the same HTTP server for real-time messaging and notifications.

- **Database**: PostgreSQL via `postgres` (porsager), schema in `src/db.ts`. PostGIS for geo queries.
- **Auth**: JWT + bcrypt (`src/auth.ts`). Bearer tokens in `Authorization` header. Async middleware validates token + user existence.
- **Payments**: Stripe Connect escrow (`src/payments.ts`). Manual capture for hold/release flow.
- **Notifications**: In-app + real-time via Socket.io (`src/notifications.ts`). Per-user preferences.
- **Storage**: S3-compatible signed URL uploads (`src/storage.ts`). Supports AWS S3 and MinIO.
- **Rate limiting**: 100 req/15min API, 20 req/15min auth endpoints.

### API Routes (all under `/api/v1/`, also mounted at `/api/` for backwards compat)

| Domain | Endpoints |
|--------|-----------|
| Auth | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` |
| Users | `PUT /users/me` |
| Pets | `GET/POST /pets`, `PUT/DELETE /pets/:id` |
| Sitters | `GET /sitters` (with optional `?serviceType=&lat=&lng=&radius=&minPrice=&maxPrice=&petSize=`), `GET /sitters/:id` |
| Services | `GET /services/me`, `POST /services`, `PUT /services/:id`, `DELETE /services/:id` |
| Bookings | `POST /bookings`, `GET /bookings`, `PUT /bookings/:id/status` |
| Messages | `GET /conversations`, `GET /messages/:userId` (marks messages read) |
| Reviews | `POST /reviews` (double-blind), `GET /reviews/:userId` |
| Verification | `GET /verification/me`, `POST /verification/start`, `PUT /verification/update`, `GET /verification/:sitterId` |
| Availability | `GET /availability/:sitterId`, `POST /availability`, `DELETE /availability/:id` |
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
- **Pages**: Home, Login, Search, SitterProfile, Dashboard, Messages, TrackWalk, Profile, Pets, Services
- **Types**: `src/types.ts` — User, Pet, Service, Booking, Message, Review, Availability, WalkEvent
- **Path alias**: `@/*` maps to project root

### Database Schema (`src/db.ts`)

PostgreSQL with PostGIS. Tables: `users` (with `location` geography column), `pets`, `services`, `bookings`, `messages`, `reviews`, `availability`, `walk_events`, `verifications`, `notifications`, `notification_preferences`, `push_subscriptions`.

PostgreSQL enums: `user_role`, `booking_status`, `payment_status`, `service_type`, `walk_event_type`, `id_check_status`, `bg_check_status`, `notification_type`, `push_platform`.

Auto-seeded with 3 demo accounts on empty DB: `owner@example.com`, `sitter@example.com`, `dual@example.com` (password: `password123`).

### Key Libraries

- `date-fns` v4 — date formatting (see `docs/DATETIME_GUIDE.md`)
- `lucide-react` — icons
- `motion` — animations (Framer Motion v12)
- `clsx` + `tailwind-merge` — conditional class composition
- `postgres` — PostgreSQL driver (tagged template literals)
- `stripe` — Stripe Connect payments
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3 uploads

## Testing

111 tests across 11 suites (Vitest, 96%+ backend source coverage). See `DEVELOPMENT.md` for full testing guide.

## Guides

- **Date/time handling**: `docs/DATETIME_GUIDE.md`
- **Validation strategy**: `docs/VALIDATION_GUIDE.md`
- **Development practices**: `DEVELOPMENT.md`

## Design System

- **Colors**: Emerald primary, Stone neutrals, Amber/Red accents
- **Patterns**: Cards with `rounded-2xl shadow-sm`, status badges with color mapping, responsive grids
- **Mobile-first**: Tailwind responsive breakpoints (`md:`, `lg:`)
