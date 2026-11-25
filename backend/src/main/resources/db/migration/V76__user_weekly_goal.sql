-- 개인 주간 목표 — 사용자당 1개, 매주 같은 목표가 반복된다.
-- 주 경계는 홈 '이번 주 활동' 카드와 같다: 월요일 시작, 운동 날짜는 workout_session.started_at_local
-- (기기 벽시계), "이번 주"는 users.time_zone 기준 오늘이 속한 주.
create table user_weekly_goal (
  user_id uuid primary key references users(id) on delete cascade,
  goal_type varchar(16) not null check (goal_type in ('DISTANCE', 'RUNS')),
  target_value int not null check (target_value > 0),
  last_achieved_week date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table user_weekly_goal is '개인 주간 목표(사용자당 1개, 매주 반복)';
comment on column user_weekly_goal.goal_type is 'DISTANCE=주간 거리, RUNS=주간 러닝 횟수';
comment on column user_weekly_goal.target_value is 'DISTANCE면 미터, RUNS면 횟수';
comment on column user_weekly_goal.last_achieved_week is '달성 축하를 마지막으로 띄운 주의 월요일. 주당 1회 축하 판정용';
