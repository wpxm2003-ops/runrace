-- 레이스(대결)의 언어. 생성 시점 작성자 UI 언어로 고정되며, 공개 목록을 언어별로 필터링한다.
-- 기존 행은 기본값 'ko'로 채워진다.
alter table challenge
  add column if not exists lang_cd varchar(5) not null default 'ko';
