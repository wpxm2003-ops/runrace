-- 운동의 "현지 벽시계 시각" 박제 (패턴 A: 활동의 날짜는 뛴 그 순간·그 장소의 것).
--
-- started_at(timestamptz, UTC)만으로는 사용자의 로컬 날짜를 알 수 없어, 잔디·스트릭·달력이
-- 전부 KST 고정으로 계산됐다 — 마닐라 저녁 런이 KST로 다음날로 밀리는 식. 저장 시점에
-- 기기의 벽시계 시각을 함께 박아두면 언어·거주지·여행과 무관하게 날짜가 맞는다.
--
-- 백필은 KST 변환: 기존 사용자는 사실상 전원 한국이라 정확하다.
alter table workout_session add column started_at_local timestamp;

update workout_session set started_at_local = started_at at time zone 'Asia/Seoul';

alter table workout_session alter column started_at_local set not null;

comment on column workout_session.started_at_local is
  '운동 시작 시각의 기기 현지 벽시계(타임존 없음). 잔디·스트릭·달력 등 개인 날짜 집계의 기준. 구클라이언트 폴백은 KST 변환.';

-- 기록 달력(연도 범위 조회)·개인 날짜 집계가 (user_id, started_at_local) 범위로 읽는다.
create index idx_workout_session_user_started_local
  on workout_session (user_id, started_at_local desc);
