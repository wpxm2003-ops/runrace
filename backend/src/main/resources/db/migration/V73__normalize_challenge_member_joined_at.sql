-- challenge.created_at이 레이스 생성 시각의 단일 출처다. challenge_member.created_at은
-- joined_at과 항상 함께 기록되어 의미가 중복되므로 제거한다.

-- V18 적용 전에 이미 존재했던 비방장 행은 당시 실제 참가 시각이 없어 레이스 생성 시각에
-- UUID 순서대로 1초를 더한 합성값으로 채웠다. Flyway 적용 시각을 경계로 이 값만 NULL로
-- 되돌려, 합성 시각을 실제 참가 시각처럼 노출하지 않는다.
alter table challenge_member
  alter column joined_at drop not null;

update challenge_member cm
   set joined_at = null
  from challenge c,
       flyway_schema_history h
 where h.version = '18'
   and h.success = true
   and cm.challenge_id = c.id
   and cm.user_id <> c.creator_user_id
   and cm.created_at < (h.installed_on at time zone current_setting('TimeZone'));

-- 방장의 참가 시각은 레이스 생성과 같은 사건이므로 생성 시각과 정확히 맞춘다.
update challenge_member cm
   set joined_at = c.created_at
  from challenge c
 where c.id = cm.challenge_id
   and cm.user_id = c.creator_user_id;

alter table challenge_member
  drop column created_at;

comment on column challenge_member.joined_at is
  '레이스 참가 시각. V18 이전 비방장 데이터는 실제 시각을 복원할 수 없어 NULL.';
