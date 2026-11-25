-- 재방문(활성 사용자·가입 코호트) 측정용 일일 활성 기록.
--
-- analytics_event(V20)와 로그인 이력(V68)을 지운 뒤로 서버에는 "누가 어느 날 앱을 열었는지"가
-- 남지 않아 DAU·재방문율을 잴 수 없었다. 앱 부팅·포그라운드 복귀 때 클라이언트가 하루 한 번
-- 핑을 보내고, 서버가 사용자 현지 날짜(핑에 실린 기기 시간대, 없으면 users.time_zone) 기준으로
-- 한 행만 남긴다.
--
-- 사용자 ID·현지 날짜·플랫폼과 그 날 첫 핑의 서버 시각 하나만 저장한다(IP·기기 정보·위치 없음).
-- 보존 기간은 활동 이력과 같은 runrace.history.retention-days(기본 365일)로 정리하고,
-- 탈퇴 시에는 즉시 삭제한다.
create table user_daily_active (
  user_id uuid not null references users(id),
  local_date date not null,
  platform varchar(20) not null,
  created_at timestamptz not null default now(),
  -- 같은 날 같은 플랫폼의 핑은 한 행으로 합친다(insert ... on conflict do nothing).
  primary key (user_id, local_date, platform)
);

-- 일자별 DAU·기간 활성 사용자 집계와 보존 기간 정리가 날짜 범위로 읽는다.
-- 사용자별 조회는 기본 키의 선두 컬럼(user_id)이 받쳐준다.
create index idx_user_daily_active_local_date
  on user_daily_active (local_date);

comment on table user_daily_active is '재방문 측정용 일일 활성 기록. 사용자·현지 날짜·플랫폼당 1행';
comment on column user_daily_active.user_id is '활동한 사용자';
comment on column user_daily_active.local_date is '핑 시점의 사용자 현지 날짜(핑의 기기 시간대 → users.time_zone → Asia/Seoul 순)';
comment on column user_daily_active.platform is '클라이언트 플랫폼: android_app | web | ios_web';
comment on column user_daily_active.created_at is '그 날 첫 핑을 받은 서버 시각';
