-- 크루 개인 목표를 주간 → 월간으로 통일한다(잔디·보드도 캘린더 월 기준으로 맞춤).
alter table crew rename column week_goal_km to month_goal_km;
comment on column crew.month_goal_km is '크루원 1인당 월간 목표 거리(km). null=목표 없음.';
