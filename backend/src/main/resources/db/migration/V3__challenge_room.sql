alter table challenge
  add column if not exists title varchar(200),
  add column if not exists goal_km integer,
  add column if not exists max_members integer,
  add column if not exists winner_user_id uuid references app_user(id) on delete set null;

update challenge
set title = coalesce(title, '50km 대결'),
    goal_km = coalesce(goal_km, 50),
    max_members = coalesce(max_members, 50)
where title is null or goal_km is null or max_members is null;

alter table challenge
  alter column title set not null,
  alter column goal_km set not null,
  alter column max_members set not null;
