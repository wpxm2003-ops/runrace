-- 레이스 목표를 소수 km로 확장(미터급 정밀도). 마일 입력을 무손실로 저장하기 위함.
alter table challenge
  alter column goal_km type numeric(10, 3) using goal_km::numeric;
