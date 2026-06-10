alter table challenge_member
  add column created_at timestamptz not null default now(),
  add column joined_at timestamptz not null default now();

-- 기존 데이터: 방장은 대결 생성 시각
update challenge_member cm
   set created_at = c.created_at,
       joined_at = c.created_at
  from challenge c
 where c.id = cm.challenge_id
   and cm.user_id = c.creator_user_id;

-- 기존 데이터: 그 외 멤버는 생성 시각 + id 순서로 1초 간격(정확한 참여 시각은 없음)
with ordered as (
  select cm.id,
         row_number() over (partition by cm.challenge_id order by cm.id) as rn,
         c.created_at
    from challenge_member cm
    join challenge c on c.id = cm.challenge_id
   where cm.user_id <> c.creator_user_id
)
update challenge_member cm
   set created_at = o.created_at + (o.rn * interval '1 second'),
       joined_at = o.created_at + (o.rn * interval '1 second')
  from ordered o
 where cm.id = o.id;
