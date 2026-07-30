-- 대항전 종료 시점의 양측 최종 거리 스냅샷.
-- 지금까지는 승자(winner_crew_id)만 고정하고 점수는 화면을 열 때마다 workout_session에서
-- 다시 집계했다. 그래서 종료 후 운동 삭제·늦은 저장이 생기면 표시 점수가 움직여
-- "고정된 승자"와 모순되는 결과가 보일 수 있었다(레이스 쪽 isResultLocked에 해당하는
-- 보호가 대항전에는 없었다). 확정 시 합계를 박아두고, 종료된 매치는 이 값을 우선 쓴다.
-- 기존 확정분은 null로 남아 실시간 집계로 폴백한다.
alter table crew_match
  add column if not exists challenger_distance_m bigint,
  add column if not exists opponent_distance_m   bigint;

comment on column crew_match.challenger_distance_m is '종료 확정 시점의 도전 크루 합산 거리(m). null이면 구 데이터 — 실시간 집계로 폴백.';
comment on column crew_match.opponent_distance_m  is '종료 확정 시점의 상대 크루 합산 거리(m). null이면 구 데이터 — 실시간 집계로 폴백.';
