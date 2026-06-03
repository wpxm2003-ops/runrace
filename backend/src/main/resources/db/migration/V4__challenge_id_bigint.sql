-- challenge PK를 bigint(자동 증가)로 전환 (기존 대결 데이터는 초기화됨)
drop table if exists challenge_member;
drop table if exists challenge;

create table challenge (
  id bigserial primary key,
  creator_user_id uuid not null references app_user(id) on delete cascade,
  type varchar(20) not null,
  status varchar(20) not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  created_at timestamptz not null default now(),
  title varchar(200) not null,
  goal_km integer not null,
  max_members integer not null,
  winner_user_id uuid references app_user(id) on delete set null
);

create table challenge_member (
  id uuid primary key default uuid_generate_v4(),
  challenge_id bigint not null references challenge(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  total_km numeric(10,3) not null default 0,
  last_sync_at timestamptz,
  finished_at timestamptz,
  unique (challenge_id, user_id)
);

create index idx_challenge_member_challenge_id on challenge_member(challenge_id);
