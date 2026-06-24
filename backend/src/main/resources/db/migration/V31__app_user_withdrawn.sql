-- 탈퇴(익명화) 표식. null=정상 회원, 값 있으면 탈퇴 시각. 개인정보는 익명화하되 레이스 정합성을 위해 행은 보존.
alter table app_user add column withdrawn_at timestamptz;
