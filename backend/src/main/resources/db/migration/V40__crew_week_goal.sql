-- 주간 크루 목표(선택) — 리더가 설정하는 매주 반복 목표 거리(km). null이면 목표 없음.
alter table crew add column week_goal_km numeric(10,3);
