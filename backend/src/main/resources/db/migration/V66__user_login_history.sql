create table user_login_history (
  id bigserial primary key,
  user_id uuid not null references users(id),
  logged_in_at timestamptz not null,
  provider varchar(50),
  platform varchar(30),
  user_agent varchar(500)
);

create index idx_user_login_history_user_time
  on user_login_history (user_id, logged_in_at desc);
