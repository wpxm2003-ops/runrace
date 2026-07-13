-- 크루 대항전(C1) — 도전장(PENDING) → 수락(ACCEPTED, 다음날 0시 KST 시작) → 기간 종료 후 lazy 확정.
-- 점수는 로스터 멤버들의 [start_at, end_at) 운동 합산으로 파생(집계 테이블 없음).
-- 크루 해체 시 대결·로스터도 함께 삭제된다(cascade — v1 수용, 전적은 크루와 운명 공동체).
create table crew_match (
  id bigserial primary key,
  challenger_crew_id bigint not null references crew(id) on delete cascade,
  opponent_crew_id bigint not null references crew(id) on delete cascade,
  status varchar(10) not null default 'PENDING',
  roster_size int not null,
  duration_days int not null,
  start_at timestamptz,
  end_at timestamptz,
  is_ended boolean not null default false,
  winner_crew_id bigint references crew(id) on delete set null,
  created_at timestamptz not null default now(),
  check (challenger_crew_id <> opponent_crew_id),
  check (status in ('PENDING', 'ACCEPTED', 'DECLINED'))
);

create index idx_crew_match_challenger on crew_match (challenger_crew_id);
create index idx_crew_match_opponent on crew_match (opponent_crew_id);

-- 출전 로스터 — 양 크루가 각 roster_size명씩 지명. 사용자당 매치 1행.
create table crew_match_roster (
  id bigserial primary key,
  match_id bigint not null references crew_match(id) on delete cascade,
  crew_id bigint not null references crew(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  unique (match_id, user_id)
);

create index idx_crew_match_roster_match on crew_match_roster (match_id);
