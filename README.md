# TI Job Command Center

Change orders, TI allowances and job margin for commercial build-out contractors.
Built by ALS Professional Services, LLC.

## What it does today (v0.1)
- Jobs with contract value, TI allowance and budgeted cost
- Change orders from the field: cost + markup = price, photos, bill to tenant or allowance
- "Get signature" creates a private link; the tenant or landlord signs on any phone. The signature records name, time, IP and a fingerprint of the exact terms
- TI allowance tracker: used, awaiting signature, remaining, tenant overage
- Margin panel: bid vs. projected margin, fade warning, work not yet signed
- Teammate invites, magic-link sign-in, one account per company with data walled off from every other company
- Systeme.io webhook creates the account on purchase and makes it read-only on cancel

## Set it up (about 30 minutes)
1. **Supabase**: create a project. In SQL Editor, run `supabase/migrations/0001_init.sql`.
   Auth → URL Configuration: set Site URL to your app URL and add `<app URL>/auth/callback` to redirect URLs.
2. **Vercel**: import this repo. Add the variables from `.env.example` (Supabase keys from Project Settings → API).
3. **Systeme.io**: create price plans named with Starter, Pro or Team. Settings → Webhooks → add
   `<app URL>/api/webhooks/systeme?key=<SYSTEME_WEBHOOK_KEY>` for **New sale** and **Sale canceled**.
   Send a test sale and check the Vercel logs to confirm the payload fields (see CLAUDE.md TODO).
4. **First account by hand** (for founding clients before billing is live): in Supabase SQL Editor,
   ```sql
   insert into companies (name, plan, billing_email) values ('Client Co', 'pro', 'owner@client.com') returning id;
   insert into invites (company_id, email, role) values ('<id from above>', 'owner@client.com', 'owner');
   ```
   They sign in at `/login` with that email.

## Develop
```
npm install
cp .env.example .env.local   # fill in
npm run dev
npm test
```
