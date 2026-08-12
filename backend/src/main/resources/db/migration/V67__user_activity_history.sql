create table user_activity_history (
  id bigserial primary key,
  actor_user_id uuid not null references users(id),
  subject_user_id uuid not null references users(id),
  action_type varchar(50) not null,
  target_type varchar(30) not null,
  target_id varchar(64) not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

create index idx_user_activity_history_actor_time
  on user_activity_history (actor_user_id, occurred_at desc);

create index idx_user_activity_history_subject_time
  on user_activity_history (subject_user_id, occurred_at desc);

create index idx_user_activity_history_target_time
  on user_activity_history (target_type, target_id, occurred_at desc);

create index idx_user_activity_history_action_time
  on user_activity_history (action_type, occurred_at desc);

comment on table user_activity_history is '운영 확인이 필요한 사용자 상태 변경 이력';
comment on column user_activity_history.actor_user_id is '행위를 수행한 사용자';
comment on column user_activity_history.subject_user_id is '행위로 영향받은 사용자';
comment on column user_activity_history.metadata is '민감한 자유 입력값을 제외한 부가 식별 정보';
