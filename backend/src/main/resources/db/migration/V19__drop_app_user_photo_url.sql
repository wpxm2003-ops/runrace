-- 프로필 사진 미사용 — 수집·저장 중단에 따른 컬럼 제거
ALTER TABLE app_user DROP COLUMN IF EXISTS photo_url;
