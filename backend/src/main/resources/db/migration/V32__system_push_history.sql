create table system_push_history (
  id        bigserial primary key,
  user_id   uuid        not null references app_user(id),
  push_type varchar(30) not null,
  title     text        not null,
  body      text        not null,
  sent_at   timestamptz not null default now()
);

create index idx_system_push_history_user_sent on system_push_history(user_id, sent_at desc);
