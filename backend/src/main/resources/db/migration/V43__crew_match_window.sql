-- 대결 기간을 도전장 작성 시 레이스 등록과 동일하게 직접 설정한다.
-- duration_days(정해진 일수 선택)는 폐기하고 start_at/end_at을 생성 시점에 바로 확정한다
-- (기존에는 수락 시점에 "다음날 0시 KST"로 자동 계산했다). 목표 km는 두지 않는다 —
-- 항상 기간 내 무제한 총거리 합산으로만 승부한다.
alter table crew_match drop column duration_days;
