-- V14: 핫 경로 쿼리용 인덱스 추가
-- 운동/데일리 동기화, 실내러닝 투표/조회, 운동 삭제 시마다 타는 FK 컬럼들.

-- findAllActiveForUser 등 user_id 단독 조회 (복합 unique는 challenge_id 선행이라 미사용)
create index if not exists idx_challenge_member_user
  on challenge_member (user_id);

-- findAllByWorkoutSessionId — 투표/운동 삭제마다 조회 (unique는 workout_session_id가 후행이라 미사용)
create index if not exists idx_challenge_workout_session
  on challenge_workout (workout_session_id);

-- 승인 대기/거부 목록 — challenge_id + approval_status 필터
create index if not exists idx_challenge_workout_challenge_status
  on challenge_workout (challenge_id, approval_status);
