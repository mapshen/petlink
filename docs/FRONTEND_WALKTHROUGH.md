# Frontend Walkthrough

A page-by-page guide to the PetLink web application.

## Global Shell (Layout)

- **Header**: PetLink logo (emerald paw icon), nav links (Search, Dashboard, Messages). For users with role "both", a Stripe-style Owner/Sitter mode toggle appears in the header. User avatar + logout on the right; "Log In" button when unauthenticated.
- **Mode toggle**: Switches between Owner and Sitter views globally. Affects Dashboard (which bookings and actions are shown), Profile page (which sections are visible), and onboarding checklist visibility. Persisted in localStorage.
- **Footer**: Privacy, Terms, Sitemap links.

## Pages

### `/` — Home

- **Hero section**: Full-width emerald banner with background image and tagline *"Loving pet care in your neighborhood"*.
- **Search bar**: Service type dropdown (Walking, Sitting, Drop-in, Grooming, Meet & Greet), location input, Search button. Navigates to `/search`.
- **Services grid**: 4 cards showcasing Dog Walking, House Sitting, Drop-in Visits, and Grooming with stock photos.

### `/login` — Login / Signup

- **OAuth buttons** at the top: Continue with Google, Apple, Facebook (branded buttons). Each button only renders when its env var is configured (`GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `FACEBOOK_APP_ID`). First-time OAuth users redirect to `/onboarding`.
- "or sign in with email" divider between OAuth and email form.
- Toggle between Sign In and Create Account.
- Fields: email, password (+ name for signup).
- Dev mode shows demo credentials (`owner@example.com` / `password123`).
- Redirects to Dashboard on success.

### `/search` — Sitter Search

- **Location bar**: Address/zip input, radius dropdown (5/10/25/50 mi), Search button, "Use My Location" (browser geolocation). Geocodes via OpenStreetMap Nominatim.
- **Filters panel** (collapsible): Price range (min/max), pet size (Small/Medium/Large/Giant toggle chips). Syncs to URL params.
- **Results grid**: Sitter cards with avatar, name, distance, price, bio snippet, star rating, verification badge, accepted pet sizes. Heart (favorite) button for logged-in users. Each card links to the sitter's profile.

### `/sitter/:id` — Sitter Profile

Two-column layout:

**Left column (profile)**:
- Avatar, name, location, rating badge, verification badge, favorite button
- Bio and accepted pet sizes
- Photo gallery with lightbox viewer
- Reviews list with star ratings

**Right column (sticky booking card)**:
- Service selector (radio-style buttons with price)
- Calendar date picker showing sitter availability
- Time slot picker (appears after date selection)
- Pet selector (multi-pet checkboxes)
- Price breakdown (base price + extra pets)
- "Request Booking" button
- Cancellation policy info
- "Message [sitter name]" link

### `/dashboard` — Dashboard

- **Onboarding checklist** for new sitters (dismissible)
- **Favorite sitters** row (if any saved)
- **Bookings list**: Each booking shows the other person's avatar/name, service type, pet names, date/time, and a status badge (pending / confirmed / cancelled / in_progress / completed).
  - **Sitter actions**: Accept or Decline pending bookings
  - **Owner actions**: Cancel pending/confirmed bookings (confirmation dialog with refund info based on cancellation policy)
  - **Track Walk** button for in-progress bookings
  - **Book Again** button for completed bookings

### `/messages` — Messages

Split-pane layout:

- **Left pane**: Conversation list with avatars, names, last message preview, relative timestamps, unread count badges.
- **Right pane**: Chat thread with bubble-style messages (emerald = sent, white = received), timestamps, text input + send button.
- Real-time updates via Socket.io.
- Mobile-responsive: toggles between list view and thread view with a back button.

### `/profile` — My Account (Sidebar Layout)

Single scrollable page with sidebar navigation and stacked sections. Content changes based on the global Owner/Sitter mode. Old routes `/pets`, `/services`, `/photos` redirect here.

**Sidebar** (vertical on desktop, horizontal on mobile):
- User mini-card (avatar, name, current mode label)
- Anchor links to scroll to each section on the page

**Owner mode** — Profile section + My Pets section:

- **Profile**: Avatar upload, name, bio, role toggle (Pet Parent / Sitter / Both), linked accounts (view/unlink Google/Apple/Facebook)
- **My Pets**: Grid of pet cards with photo, name, breed, age, weight, medical history. Add/Edit/Delete with photo upload (S3).

**Sitter mode** — Profile section + Services section + Photos section:

- **Profile**: Same as owner mode
- **Services**: Service listing with type, description, pricing, extra pet price. Add/Edit/Delete. Cancellation policy selector (Flexible/Moderate/Strict).
- **Photos**: Photo gallery management. Upload, reorder, delete photos.

### `/track/:bookingId` — Track Walk

- Real-time walk tracking with GPS event updates on a map.

### `/onboarding` — Sitter Onboarding

- Guided setup flow for new sitters to complete their profile, add services, set availability, and upload photos.

## Demo Accounts

The database seeds 3 accounts when empty:

| Email | Password | Role |
|---|---|---|
| `owner@example.com` | `password123` | owner |
| `sitter@example.com` | `password123` | sitter |
| `dual@example.com` | `password123` | both |
