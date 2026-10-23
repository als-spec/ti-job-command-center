-- TI Job Command Center: initial schema
-- Multi-tenant: every business row carries company_id, and row-level security
-- limits each signed-in user to the companies they belong to.

create extension if not exists pgcrypto;

-- Companies (one per paying customer) ---------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','team')),
  status text not null default 'active' check (status in ('active','canceled')),
  billing_email text unique,             -- buyer email from Systeme.io
  co_prefix text not null default 'CO',  -- change order numbering, e.g. CO-0012
  default_markup_pct numeric(5,2) not null default 15,
  created_at timestamptz not null default now()
);

-- Who belongs to which company ----------------------------------------------
create table public.memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index on public.memberships (user_id);

-- Pending invites: created by the billing webhook or by an owner, claimed on first sign-in
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

-- Jobs (one build-out) --------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  tenant_name text,
  landlord_name text,
  address text,
  space_type text check (space_type in ('office','medical','restaurant','retail','other')),
  square_feet integer check (square_feet is null or square_feet > 0),
  contract_value numeric(12,2) not null default 0 check (contract_value >= 0),
  ti_allowance numeric(12,2) not null default 0 check (ti_allowance >= 0),
  budget_cost numeric(12,2) not null default 0 check (budget_cost >= 0),
  status text not null default 'active' check (status in ('bidding','active','closeout','closed')),
  created_at timestamptz not null default now()
);
create index on public.jobs (company_id);

-- Cost lines: what's committed (subs, POs) and what's actually spent ---------
create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  description text not null,
  kind text not null check (kind in ('committed','spent')),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index on public.cost_entries (job_id);

-- Change orders ---------------------------------------------------------------
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  number integer not null,
  title text not null,
  description text,
  requested_by text,                       -- tenant, landlord, architect...
  cost numeric(12,2) not null default 0 check (cost >= 0),
  markup_pct numeric(5,2) not null default 0 check (markup_pct >= 0),
  price numeric(12,2) not null default 0 check (price >= 0), -- what the client pays
  schedule_days integer not null default 0,
  bill_to text not null default 'tenant' check (bill_to in ('tenant','landlord_allowance')),
  status text not null default 'draft' check (status in ('draft','sent','signed','declined','void')),
  sign_token text unique,                  -- random token for the public signing link
  sent_at timestamptz,
  signer_name text,
  signer_email text,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  signed_snapshot jsonb,                   -- exact terms shown when signed
  snapshot_sha256 text,                    -- hash of that snapshot, for disputes
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (job_id, number)
);
create index on public.change_orders (company_id);
create index on public.change_orders (job_id);

-- Photos attached to a change order (stored in Supabase Storage bucket "co-photos")
create table public.change_order_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Signed change orders can't be edited, only voided --------------------------
create or replace function public.lock_signed_change_orders() returns trigger
language plpgsql as $$
begin
  if old.status = 'signed' and (
       new.price is distinct from old.price or
       new.cost is distinct from old.cost or
       new.title is distinct from old.title or
       new.description is distinct from old.description or
       new.schedule_days is distinct from old.schedule_days or
       new.signed_snapshot is distinct from old.signed_snapshot or
       (new.status is distinct from old.status and new.status <> 'void')
     ) then
    raise exception 'Signed change orders cannot be edited. Void it and create a new one.';
  end if;
  return new;
end $$;
create trigger change_orders_lock before update on public.change_orders
for each row execute function public.lock_signed_change_orders();

-- Next change order number per job --------------------------------------------
create or replace function public.next_co_number(p_job uuid) returns integer
language sql stable as $$
  select coalesce(max(number), 0) + 1 from public.change_orders where job_id = p_job
$$;

-- Row-level security -----------------------------------------------------------
create or replace function public.is_member(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.company_id = p_company and m.user_id = auth.uid())
$$;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.jobs enable row level security;
alter table public.cost_entries enable row level security;
alter table public.change_orders enable row level security;
alter table public.change_order_photos enable row level security;

create policy "members read their company" on public.companies
  for select using (public.is_member(id));
create policy "owners update their company" on public.companies
  for update using (exists (select 1 from public.memberships m
    where m.company_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')));

create policy "members see co-members" on public.memberships
  for select using (public.is_member(company_id));

create policy "owners manage invites" on public.invites
  for all using (exists (select 1 from public.memberships m
    where m.company_id = invites.company_id and m.user_id = auth.uid() and m.role in ('owner','admin')))
  with check (exists (select 1 from public.memberships m
    where m.company_id = invites.company_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

-- Business tables: members of an active company can read and write
do $$
declare t text;
begin
  foreach t in array array['jobs','cost_entries','change_orders','change_order_photos'] loop
    execute format($f$
      create policy "members read %1$s" on public.%1$s for select using (public.is_member(company_id));
      create policy "members insert %1$s" on public.%1$s for insert with check (
        public.is_member(company_id) and exists (select 1 from public.companies c where c.id = company_id and c.status = 'active'));
      create policy "members update %1$s" on public.%1$s for update using (public.is_member(company_id))
        with check (public.is_member(company_id));
      create policy "members delete %1$s" on public.%1$s for delete using (public.is_member(company_id));
    $f$, t);
  end loop;
end $$;

-- Claim pending invites on sign-in (called from the app after login) ----------
create or replace function public.claim_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.memberships (company_id, user_id, role)
  select i.company_id, auth.uid(), i.role
  from public.invites i
  where lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    and i.claimed_at is null
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.invites set claimed_at = now()
  where lower(email) = lower((select email from auth.users where id = auth.uid())) and claimed_at is null;
  return n;
end $$;
grant execute on function public.claim_invites() to authenticated;

-- Photo storage ----------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('co-photos', 'co-photos', false)
on conflict (id) do nothing;

-- Paths are "<company_id>/<change_order_id>/<file>"; members of that company only
create policy "members read co photos" on storage.objects for select
  using (bucket_id = 'co-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "members upload co photos" on storage.objects for insert
  with check (bucket_id = 'co-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
