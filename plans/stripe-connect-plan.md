# Plan: Stripe Connect Express Migration (#390)

Implemented. See PR for full details.

## What Changed
- Direct charges → destination charges via Stripe Connect Express
- Sitters create Express connected accounts via `/connect/*` endpoints
- Stripe holds sitter funds (PetLink never handles money transmission)
- Application fee: 15% for free tier, 0% for Pro/Premium
- `sitter_payouts` table is now a read model populated by webhooks
- Tips route 100% to sitter via `transfer_data`
- Refunds use `reverse_transfer` to reverse connected account transfers
- Bookings blocked if sitter hasn't completed Connect onboarding
