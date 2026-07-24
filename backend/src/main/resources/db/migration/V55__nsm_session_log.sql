-- NSM sub-T 세션 수행 로그(append-only).
-- training_plan은 유저당 1행 upsert라 sub_t_days를 바꾸면 과거 스케줄이 사라지고, 취소하면 행 자체가 삭제된다.
-- 그래서 "누가 NSM을 실제로 수행했는가"는 사후 복원이 불가능하다(이지런까지 매일 뛰는 방법론이라
-- workout_session 유무로도 구분되지 않음). 수행 시점에만 알 수 있는 사실을 여기에 확정 기록한다.
create table nsm_session_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  -- 이 세션을 채운 운동 기록(soft 참조 — 운동이 지워져도 수행 이력은 보존).
  workout_id bigint,
  session_day smallint not null check (session_day between 0 and 6),
  session_kind varchar(10) not null check (session_kind in ('SHORT', 'MEDIUM', 'LONG')),
  -- 수행 당시 값을 그대로 박아둔다 — 이후 플랜이 바뀌어도 그때의 처방을 알 수 있게.
  target_pace_sec int,
  reps_planned int,
  reps_done int,
  -- 가이드가 마지막 렙까지 도달했는지. false = sub-T 날에 뛰었지만 세션은 미완주.
  completed boolean not null default false,
  completed_at timestamptz not null default now()
);

create index idx_nsm_session_log_user on nsm_session_log (user_id, completed_at desc);

-- 같은 운동 기록으로 두 번 로깅되지 않도록(저장 재시도 방어).
create unique index uq_nsm_session_log_workout on nsm_session_log (workout_id)
  where workout_id is not null;

comment on table nsm_session_log is
  'NSM sub-T 세션 수행 로그. 플랜 변경·취소와 무관하게 이력 보존(append-only).';
comment on column nsm_session_log.session_kind is 'sub-T 세션 종류(SHORT/MEDIUM/LONG). EASY·LONGRUN은 기록하지 않는다.';
comment on column nsm_session_log.completed is '렙 가이드를 끝까지 완료했는지. false=해당 요일에 뛰었으나 세션 미완주.';
