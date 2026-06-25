create table personal_best (
  id              bigserial    primary key,
  user_id         uuid         not null references app_user(id),
  distance_key    varchar(10)  not null,
  best_pace_sec   int          not null,
  distance_m      int          not null,
  workout_id      bigint       not null references workout_session(id),
  achieved_at     timestamptz  not null,
  unique (user_id, distance_key)
);
create index idx_personal_best_user on personal_best(user_id);
