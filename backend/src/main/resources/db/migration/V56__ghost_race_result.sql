alter table workout_session
  add column ghost_workout_id bigint,
  add column ghost_result jsonb;

alter table workout_session
  add constraint ck_workout_session_ghost_pair
  check ((ghost_workout_id is null) = (ghost_result is null));

comment on column workout_session.ghost_workout_id is
  'Workout used as the ghost. Kept as a soft reference so race history survives source deletion.';
comment on column workout_session.ghost_result is
  'Computed ghost result: overlapDistanceM, myTimeMs, ghostTimeMs, and deltaMs.';
