-- 사용자 언어 선호값. 푸시 알림을 수신자 언어로 보내기 위해 저장한다.
alter table app_user
  add column if not exists lang_cd varchar(5) not null default 'ko';
