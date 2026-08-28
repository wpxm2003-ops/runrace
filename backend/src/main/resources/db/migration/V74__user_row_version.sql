-- 사용자 설정·프로필 갱신과 탈퇴 익명화가 경합할 때 오래된 엔티티의 전체 행 UPDATE가
-- 나중 변경을 되돌리지 못하도록 AppUser의 JPA @Version 컬럼을 추가한다.
ALTER TABLE users
    ADD COLUMN row_version BIGINT NOT NULL DEFAULT 0;

-- 신규 행의 버전은 Hibernate가 명시하므로 DB 기본값에 의존하지 않는다.
ALTER TABLE users
    ALTER COLUMN row_version DROP DEFAULT;
