# TI Job Command Center

Job system for independent commercial contractors doing $1M–$5M a year in tenant-improvement (TI) build-outs.
Owner: ALS Professional Services, LLC. Promise: every tenant change priced and signed before the crew touches it.

## Stack
- Next.js 15 (App Router, server actions), TypeScript, Tailwind v4
- Supabase: Postgres + row-level security, magic-link auth, Storage (`co-photos` bucket)
- Hosting: Vercel. Billing, sales pages, emails and affiliates: Systeme.io (Stripe underneath)

## Architecture rules
- **Multi-tenant.** Every business table has `company_id`. RLS (`public.is_member`) is the only access control for signed-in users. Never filter by company in app code as a substitute for RLS.
- **Service-role client** (`supabaseAdmin`) is used in exactly two places: `/sign/[token]` (public signing) and `/api/webhooks/systeme` (billing). Don't add more without a reason written here.
- **Signed change orders are immutable** (DB trigger `lock_signed_change_orders`). To change one: void it and create a new one.
- **Signature record**: signer name, optional email, timestamp, IP, user agent, the exact terms shown (`signed_snapshot`) and its SHA-256 (`snapshot_sha256`). ESIGN Act consent text lives on the signing page.
- **Pure logic lives in `src/lib`** with unit tests (`jobMath`, `signing`, `billing`). Keep pages thin.
- **Customization policy**: features most clients need go on the public roadmap; one-client changes are scoped, fixed-price modules. No open-ended monthly-updates plans.

## Data model
companies → memberships (user ↔ company, role owner/admin/member) · invites (claimed on first sign-in via `claim_invites()`)
jobs (contract_value, ti_allowance, budget_cost) → change_orders (cost, markup_pct, price, bill_to tenant|landlord_allowance, status draft→sent→signed|declined, void) → change_order_photos
jobs → cost_entries (committed | spent)

## Math (src/lib/jobMath.ts)
- Allowance used = base contract + signed COs billed to the allowance. Warn at 90%, "over" below zero remaining; overage = what the tenant owes.
- Projected cost = max(budget + signed CO cost, total committed, total spent). Fade = bid margin % − projected margin %, in points.

## Billing flow (Systeme.io)
1. Buyer purchases a plan whose name contains Starter, Pro or Team.
2. Systeme.io "New sale" webhook → `/api/webhooks/systeme?key=SYSTEME_WEBHOOK_KEY` → company created (or reactivated) + owner invite for the buyer email.
3. Buyer signs in with that email → invite claimed → lands on /jobs.
4. "Sale canceled" → company status `canceled` → read-only (RLS blocks inserts).
- TODO before launch: send a test webhook from Systeme.io and confirm payload field names in `src/lib/billing.ts`.
- TODO: Systeme.io has no payment-failed webhook; add a Stripe `invoice.payment_failed` handler if dunning matters.

## Commands
- `npm run dev` · `npm test` (vitest) · `npm run typecheck` · `npm run build`
- DB tests: load `supabase/tests/supabase_stubs.sql`, the migration, then `supabase/tests/rls_test.sql` into a scratch Postgres 16; expects `ALL_RLS_TESTS_PASSED`.

## Roadmap (agreed order)
- **MVP (done in v0.1):** jobs, field change orders with photos and e-signature, TI allowance tracker, budget vs. actual with fade warning, teammate invites, Systeme.io billing webhook
- **Next for MVP launch:** signed-CO PDF + email copy to signer, estimate builder by space type, CSV import of past jobs
- **Phase 2:** AIA-style pay apps (G702/G703) with retainage, long-lead item tracker, punch list and closeout package
- **Add-on:** QuickBooks Online (one-way push first; two-way sync priced separately)
