-- 신발장 — 사용자가 등록한 러닝화 + 러닝별 신발 귀속(마일리지 추적).
create table shoe (
  id bigserial primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  brand varchar(40) not null,
  model varchar(60) not null,
  nickname varchar(40),
  -- 교체 권장 목표 거리(m). null이면 알림 없음.
  target_distance_m int check (target_distance_m is null or target_distance_m > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_shoe_user on shoe (user_id, created_at desc);
-- 사용자당 활성 신발은 최대 1개.
create unique index uq_shoe_active_per_user on shoe (user_id) where is_active;

-- 러닝을 신발에 귀속. 신발 삭제 시 기록은 남기되 귀속만 해제.
alter table workout_session add column shoe_id bigint references shoe(id) on delete set null;
create index idx_workout_session_shoe on workout_session (shoe_id) where shoe_id is not null;
