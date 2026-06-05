create table friend_nudge (
  id         bigserial primary key,
  sender_id  uuid not null references app_user(id) on delete cascade,
  receiver_id uuid not null references app_user(id) on delete cascade,
  message    varchar(50) not null,
  sent_at    timestamptz not null default now()
);

create index idx_friend_nudge_sender_receiver on friend_nudge(sender_id, receiver_id, sent_at);
