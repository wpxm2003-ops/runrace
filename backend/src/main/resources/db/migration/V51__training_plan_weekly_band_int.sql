-- V50에서 weekly_band를 smallint로 만들었으나, Hibernate의 Integer 필드는 기본적으로
-- integer(INT4) 타입을 기대해 ddl-auto: validate 스키마 검증이 실패했다(int2 vs integer).
-- 체크 제약(0~4)은 타입 변경에 영향받지 않고 그대로 유지된다.
alter table training_plan alter column weekly_band type integer;
