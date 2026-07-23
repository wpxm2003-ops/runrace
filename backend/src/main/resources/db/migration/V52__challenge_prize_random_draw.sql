alter table challenge
  add column prize_award_type varchar(20) not null default 'RANK',
  add column prize_drawn_at timestamptz;

alter table challenge_prize
  add column winner_user_id uuid references users(id) on delete set null;

create unique index uq_challenge_prize_random_winner
  on challenge_prize (challenge_id, winner_user_id)
  where winner_user_id is not null;
