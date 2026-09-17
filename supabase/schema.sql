-- ============================================================================
-- ZappyFood - Supabase / PostgreSQL schema
-- ----------------------------------------------------------------------------
-- The backend uses a document-style (JSONB) model so the existing application
-- logic maps 1:1 onto Postgres. Each former MongoDB collection becomes one
-- table with a JSONB `data` column holding the whole document.
--
-- These tables are also created automatically by the backend on startup
-- (see backend/db.py -> Database._ensure_tables). This file lets you create
-- them manually in the Supabase SQL editor if you prefer.
-- ============================================================================

create table if not exists public.users          (_pk bigserial primary key, data jsonb not null);
create table if not exists public.addresses      (_pk bigserial primary key, data jsonb not null);
create table if not exists public.stores         (_pk bigserial primary key, data jsonb not null);
create table if not exists public.products       (_pk bigserial primary key, data jsonb not null);
create table if not exists public.orders         (_pk bigserial primary key, data jsonb not null);
create table if not exists public.store_couriers (_pk bigserial primary key, data jsonb not null);
create table if not exists public.notifications  (_pk bigserial primary key, data jsonb not null);
create table if not exists public.uploads        (_pk bigserial primary key, data jsonb not null);
create table if not exists public.coupons        (_pk bigserial primary key, data jsonb not null);
create table if not exists public.chat           (_pk bigserial primary key, data jsonb not null);

-- Fast lookups by the logical document id (data->>'id')
create index if not exists users_id_idx          on public.users          ((data->>'id'));
create index if not exists addresses_id_idx      on public.addresses      ((data->>'id'));
create index if not exists stores_id_idx         on public.stores         ((data->>'id'));
create index if not exists products_id_idx       on public.products       ((data->>'id'));
create index if not exists orders_id_idx         on public.orders         ((data->>'id'));
create index if not exists store_couriers_id_idx on public.store_couriers ((data->>'id'));
create index if not exists notifications_id_idx  on public.notifications  ((data->>'id'));
create index if not exists uploads_id_idx        on public.uploads        ((data->>'id'));
create index if not exists coupons_id_idx        on public.coupons        ((data->>'id'));
create index if not exists chat_id_idx           on public.chat           ((data->>'id'));

-- Helpful secondary indexes for the hottest queries
create index if not exists users_email_idx       on public.users          ((data->>'email'));
create index if not exists addresses_user_idx    on public.addresses      ((data->>'user_id'));
create index if not exists stores_owner_idx      on public.stores         ((data->>'owner_id'));
create index if not exists products_store_idx    on public.products       ((data->>'store_id'));
create index if not exists orders_store_idx      on public.orders         ((data->>'store_id'));
create index if not exists orders_customer_idx   on public.orders         ((data->>'customer_id'));
create index if not exists notifications_user_idx on public.notifications ((data->>'user_id'));
create index if not exists chat_order_idx        on public.chat           ((data->>'order_id'));
