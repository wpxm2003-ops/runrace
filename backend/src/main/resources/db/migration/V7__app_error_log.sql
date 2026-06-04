create table app_error_log (
  id uuid primary key default uuid_generate_v4(),
  source varchar(20) not null,          -- 'frontend' | 'backend'
  message text not null,
  stack text,
  context text,                         -- url·userAgent·kind(프론트) / method·path(백엔드)
  user_id uuid,                         -- soft 참조(FK 없음: 에러 적재가 FK로 실패하지 않도록)
  request_id varchar(64),
  created_at timestamptz not null default now()
);

create index idx_app_error_log_created on app_error_log (created_at desc);
create index idx_app_error_log_source on app_error_log (source, created_at desc);
