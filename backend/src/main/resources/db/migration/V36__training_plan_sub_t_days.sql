-- sub-T 요일을 사용자가 직접 선택 — 특정 요일 강제 제거. CSV(월=0…일=6), 예: '1,3,5'.
alter table training_plan
  add column sub_t_days varchar(20) not null default '1,3,5';
