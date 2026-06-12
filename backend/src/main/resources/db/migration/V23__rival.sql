-- 라이벌 — 팔로우식 단방향 관계. user_id가 rival_user_id를 라이벌로 등록한다(수락 불필요).
-- 등록하면 레이스 화면에서 해당 상대와의 전적이 노출된다.
create table rival (
  id bigserial primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  rival_user_id uuid not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, rival_user_id),
  check (user_id <> rival_user_id)
);

-- 내 라이벌 목록 조회 가속.
create index idx_rival_user on rival (user_id);
