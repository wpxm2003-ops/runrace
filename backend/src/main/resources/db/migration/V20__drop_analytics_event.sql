-- analytics_event 미사용 — KPI는 운영 DB 조회로 대체
DROP INDEX IF EXISTS idx_analytics_event_name_created_at;
DROP TABLE IF EXISTS analytics_event;
