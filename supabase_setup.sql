-- Run this in Supabase SQL Editor

-- Disable RLS on all tables so anon key works
alter table if exists users disable row level security;
alter table if exists products disable row level security;
alter table if exists sales disable row level security;

create table if not exists users (
  id text primary key,
  username text unique not null,
  password text not null,
  role text not null default 'staff',
  created_at timestamptz default now()
);

create table if not exists products (
  id text primary key,
  name text not null,
  price numeric not null,
  stock integer not null default 0,
  category text default 'General',
  low_stock_threshold integer default 5,
  created_at timestamptz default now()
);

create table if not exists sales (
  id text primary key,
  product_id text,
  product text not null,
  quantity integer not null,
  price numeric not null,
  total numeric not null,
  sold_by text,
  date timestamptz default now()
);
