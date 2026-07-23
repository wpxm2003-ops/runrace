-- 주간 러닝 볼륨 밴드(0=<3h,1=3-4h,2=4-5h,3=5-6h,4=6-8h+) — sub-T 렙 수·요일 수·휴식을 볼륨에 맞게 스케일링.
-- NULL=미지정(레거시 플랜은 앱 레벨에서 기존 기본값으로 처리).
alter table training_plan
  add column weekly_band smallint check (weekly_band between 0 and 4);

comment on column training_plan.weekly_band is '주간 러닝 볼륨 밴드(0=<3h,1=3-4h,2=4-5h,3=5-6h,4=6-8h+). NULL=미지정(레거시 기본값).';

-- sub-T 최소 요일 수를 1로 완화 — 볼륨 밴드 0(<3h/주)은 주 1회 처방을 허용해야 한다.
-- 앱 레벨(TrainingPlanService)에서 밴드별 정확한 min/max(1~3)를 검증하므로 여기서는 전체 하한만 완화한다.
alter table training_plan drop constraint training_plan_sessions_per_week_check;
alter table training_plan add constraint training_plan_sessions_per_week_check
  check (sessions_per_week between 1 and 3);

comment on column training_plan.sessions_per_week is '주간 sub-T 세션 수(1~3, 밴드별 min/max는 앱 레벨 검증). sub_t_days 개수와 일치.';
