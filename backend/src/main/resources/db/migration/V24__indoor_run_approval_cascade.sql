-- V24: 계정 삭제 시 실내러닝 승인 투표 행도 함께 삭제되도록 CASCADE 추가.
-- 기존엔 ON DELETE CASCADE가 누락돼, 투표 이력이 있는 사용자는 탈퇴 시 FK 위반으로 실패했다.
ALTER TABLE indoor_run_approval
    DROP CONSTRAINT indoor_run_approval_voter_user_id_fkey;
ALTER TABLE indoor_run_approval
    ADD CONSTRAINT indoor_run_approval_voter_user_id_fkey
        FOREIGN KEY (voter_user_id) REFERENCES app_user (id) ON DELETE CASCADE;
