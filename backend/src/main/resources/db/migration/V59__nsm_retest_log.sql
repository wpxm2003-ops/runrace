-- NSM 재측정(5K 등 시험주로 페이스 갱신) 이력(append-only).
-- training_plan은 유저당 1행 upsert라 재측정할 때마다 이전 vdot·역치·원본 기록이 사라진다.
-- "직전 재측정보다 얼마나 빨라졌나"를 보여주려면 그 순간의 값을 여기 별도로 확정 기록해야 한다.
create table nsm_retest_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  vdot double precision not null,
  threshold_pace_sec int not null,
  source_distance_m int not null,
  source_time_sec int not null,
  weekly_band smallint,
  created_at timestamptz not null default now()
);

create index idx_nsm_retest_log_user on nsm_retest_log (user_id, created_at desc);

comment on table nsm_retest_log is
  'NSM 재측정 이력(append-only). training_plan은 upsert라 과거 값이 사라지므로 추이·블록 리포트는 여기서 계산한다.';
comment on column nsm_retest_log.created_at is '이 재측정이 저장된 시각 — 블록 리포트의 시작/종료 경계로 쓰인다.';
