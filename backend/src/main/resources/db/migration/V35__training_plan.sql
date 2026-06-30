-- NSM 훈련 플랜 — 사용자당 활성 플랜 1개. 주간 스케줄은 threshold_pace_sec + sessions_per_week로 결정적 생성.
create table training_plan (
  id bigserial primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  vdot double precision not null,
  threshold_pace_sec int not null check (threshold_pace_sec > 0),
  sessions_per_week int not null check (sessions_per_week between 2 and 3),
  -- 재계산·표시용 원본 기록
  source_distance_m int not null check (source_distance_m > 0),
  source_time_sec int not null check (source_time_sec > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_training_plan_user on training_plan (user_id);
