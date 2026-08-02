-- 크루 집계(명예의 전당·잔디·월간 보드·누적)와 기록 달력은 전부 (user_id, started_at) 범위로 읽는다.
-- 그런데 기존 인덱스는 (user_id, created_at desc)뿐이라 started_at 조건을 커버하지 못해,
-- 사용자별 행을 모두 읽어 온 뒤 걸러내는 형태로 동작했다. 기록이 쌓일수록 크루 홈 진입
-- 비용이 선형으로 늘어난다(크루 누적은 의미상 전 기간 합산이라 쿼리 쪽에서 좁힐 수 없어,
-- 이 인덱스가 유일한 개선 수단이다).
--
-- created_at 인덱스는 관리자 최근 목록이 쓰고 있어 남겨 둔다 — 이건 started_at 축 추가다.
create index if not exists idx_workout_session_user_started
  on workout_session (user_id, started_at);
