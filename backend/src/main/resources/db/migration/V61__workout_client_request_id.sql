alter table workout_session
  add column client_workout_id uuid;

create unique index uq_workout_session_user_client_workout
  on workout_session (user_id, client_workout_id)
  where client_workout_id is not null;
