-- V59에서 weekly_band를 smallint로 만들었으나, Hibernate의 Integer 필드는 integer(INT4)를 기대해
-- ddl-auto: validate 스키마 검증이 실패한다(int2 vs integer). V51에서 training_plan에 대해 고친 것과 동일한 사안.
-- 이미 integer인 환경에서도 안전한 no-op이다.
alter table nsm_retest_log alter column weekly_band type integer;
