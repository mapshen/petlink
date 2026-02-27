# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PetLink — a pet services marketplace (Rover clone) built with React 19 + Express + SQLite + Socket.io. Monorepo with frontend and backend in the same package. Originally scaffolded from Google AI Studio.

## Commands

```bash
npm run dev        # Start dev server (Express + Vite HMR on :3000)
npm run build      # Production build (Vite)
npm run lint       # Type-check only (tsc --noEmit)
npm run clean      # Remove dist/
```

No test runner is configured yet. No linter beyond TypeScript.

## Architecture

### Backend (`server.ts`)
Single Express server serves both the API and Vite-powered frontend in dev mode. Socket.io is attached to the same HTTP server for real-time messaging.

- **Database**: SQLite via `better-sqlite3`, file `petlink.db`, schema defined and seeded in `src/db.ts`
- **Auth**: Mock — login by email only, user ID passed via `x-user-id` header. JWT/bcrypt are imported but not wired up.
- **Real-time**: Socket.io handles `join_room`, `send_message`, `receive_message` events for 1:1 chat.

### API Routes (all under `/api/`)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/auth/login` | POST | Email-only login |
| `/api/auth/me` | GET | Reads `x-user-id` header |
| `/api/sitters` | GET | Optional `?service=` filter |
| `/api/sitters/:id` | GET | Includes services & reviews |
| `/api/bookings` | POST | Create booking |
| `/api/bookings` | GET | List by `x-user-id` |
| `/api/messages/:userId` | GET | Chat history |

### Frontend (`src/`)
React 19 SPA with react-router-dom v7, styled with Tailwind CSS v4.

- **Entry**: `src/main.tsx` → `src/App.tsx` (router) → `src/components/Layout.tsx` (shell)
- **Auth state**: `src/context/AuthContext.tsx` — React context + localStorage (`petlink_user`)
- **Pages**: `src/pages/` — Home, Login, Search, SitterProfile, Dashboard, Messages, TrackWalk
- **Types**: `src/types.ts` — User, Pet, Service, Booking, Message, Review interfaces
- **Path alias**: `@/*` maps to project root (configured in both vite.config.ts and tsconfig.json)

### Database Schema (`src/db.ts`)
Six tables: `users`, `pets`, `services`, `bookings`, `messages`, `reviews`. DB is created and seeded on first run with three demo accounts: `owner@example.com`, `sitter@example.com`, `dual@example.com`.

User roles: `'owner' | 'sitter' | 'both'`. Service types: `'walking' | 'sitting' | 'drop-in' | 'grooming'`. Booking statuses: `'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'`.

### Key Libraries
- `lucide-react` — icons
- `date-fns` — date formatting
- `motion` — animations (Framer Motion v12)
- `clsx` + `tailwind-merge` — conditional class composition
- `@google/genai` — Gemini API (key via `GEMINI_API_KEY` env var)

## Environment Variables

Copy `.env.example` to `.env.local`:
- `GEMINI_API_KEY` — Gemini API access
- `APP_URL` — Hosted URL (for AI Studio deployment)

## Design System

- **Colors**: Emerald primary, Stone neutrals, Amber/Red accents
- **Patterns**: Cards with `rounded-2xl shadow-sm`, status badges with color mapping, responsive grids
- **Mobile-first**: Tailwind responsive breakpoints (`md:`, `lg:`)

## Unimplemented Features

Auth hardening (JWT + bcrypt wiring), real geolocation, payments (Stripe Connect), review creation endpoint, notifications, profile/pet CRUD UI, advanced search (distance, availability), rate limiting.
