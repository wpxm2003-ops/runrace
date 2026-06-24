-- 사용자별 푸시 알림 수신 선호. 기본 true(수신). 내정보 알림 토글이 갱신한다.
alter table app_user add column push_enabled boolean not null default true;
