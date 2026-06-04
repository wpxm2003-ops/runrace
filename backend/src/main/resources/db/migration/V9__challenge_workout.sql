-- 레이스에 반영된 운동 기록 (참여자 간 공유용)
create table challenge_workout (
  id bigserial primary key,
  challenge_id bigint not null references challenge(id) on delete cascade,
  workout_session_id bigint not null references workout_session(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  applied_distance_m int not null check (applied_distance_m >= 0),
  created_at timestamptz not null default now(),
  unique (challenge_id, workout_session_id)
);

create index idx_challenge_workout_challenge_created
  on challenge_workout (challenge_id, created_at desc);
