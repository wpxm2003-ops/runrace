create table if not exists analytics_event (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_user(id) on delete set null,
  name varchar(80) not null,
  props_json text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_event_name_created_at on analytics_event(name, created_at desc);

