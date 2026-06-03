create extension if not exists "uuid-ossp";

create table if not exists app_user (
  id uuid primary key default uuid_generate_v4(),
  firebase_uid varchar(128) not null unique,
  email varchar(320),
  display_name varchar(200),
  photo_url text,
  provider varchar(50),
  created_at timestamptz not null default now()
);

create table if not exists device_token (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_user(id) on delete cascade,
  platform varchar(20) not null,
  fcm_token text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, platform, fcm_token)
);

create table if not exists friend_invite (
  id uuid primary key default uuid_generate_v4(),
  inviter_user_id uuid not null references app_user(id) on delete cascade,
  invite_code varchar(64) not null unique,
  status varchar(20) not null,
  expires_at timestamptz not null,
  accepted_user_id uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists friendship (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_user(id) on delete cascade,
  friend_user_id uuid not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

create table if not exists challenge (
  id uuid primary key default uuid_generate_v4(),
  creator_user_id uuid not null references app_user(id) on delete cascade,
  type varchar(20) not null,
  status varchar(20) not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists challenge_member (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references challenge(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  total_km numeric(10,3) not null default 0,
  last_sync_at timestamptz,
  finished_at timestamptz,
  unique (challenge_id, user_id)
);

create table if not exists daily_distance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_user(id) on delete cascade,
  date date not null,
  source varchar(30) not null,
  distance_km numeric(10,3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, source)
);

