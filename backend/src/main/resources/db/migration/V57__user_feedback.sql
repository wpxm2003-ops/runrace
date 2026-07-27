create table feedback (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  user_nickname varchar(200),
  type varchar(20) not null check (type in ('IDEA', 'INCONVENIENCE', 'BUG', 'ETC')),
  title varchar(120) not null,
  content text not null,
  image_urls jsonb not null default '[]'::jsonb,
  status varchar(20) not null default 'OPEN'
    check (status in ('OPEN', 'CHECKING', 'DONE', 'CLOSED')),
  page_url varchar(1000),
  user_agent varchar(1000),
  app_version varchar(50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_feedback_created_at on feedback (created_at desc);
create index idx_feedback_status_created_at on feedback (status, created_at desc);
