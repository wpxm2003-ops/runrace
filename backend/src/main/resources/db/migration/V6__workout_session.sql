create table workout_session (
  id bigserial primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null check (duration_sec >= 0),
  distance_m int not null check (distance_m >= 0),
  calories int not null check (calories >= 0),
  avg_pace_sec_per_km int,
  path_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_workout_session_user_created on workout_session (user_id, created_at desc);
