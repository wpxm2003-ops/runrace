-- 크루(C0) — 러닝크루 소속 단위. 주간 마일리지 보드의 집계 범위가 된다.
-- 사용자당 1개 크루(unique crew_member.user_id). 리더는 crew.leader_user_id 한 명.
-- 탈퇴(계정 익명화) 시 멤버십은 삭제되고 리더는 가장 오래된 멤버에게 승계된다(빈 크루는 삭제).
create table crew (
  id bigserial primary key,
  name varchar(20) not null unique,
  notice varchar(100),
  join_code varchar(6) not null unique,
  leader_user_id uuid not null references app_user(id),
  max_members int not null default 30,
  created_at timestamptz not null default now()
);

create table crew_member (
  id bigserial primary key,
  crew_id bigint not null references crew(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (user_id)
);

-- 크루 멤버 목록·인원수 조회 가속.
create index idx_crew_member_crew on crew_member (crew_id);
