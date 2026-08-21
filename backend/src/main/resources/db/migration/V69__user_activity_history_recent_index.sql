-- 관리자 대시보드는 사용자·행위 구분 없이 "가장 최근 N건"을 뽑는다.
-- V67의 인덱스 4개는 모두 선두 컬럼이 actor/subject/target/action이라 이 전역 정렬을
-- 받쳐주지 못해, 이력이 쌓일수록 전체 스캔 + top-N 정렬로 악화된다.
create index if not exists idx_user_activity_history_time
  on user_activity_history (occurred_at desc);
