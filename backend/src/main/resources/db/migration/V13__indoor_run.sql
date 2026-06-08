-- V13: 실내러닝 지원

-- workout_session: 운동 타입 및 이미지 URL 추가
ALTER TABLE workout_session
    ADD COLUMN workout_type VARCHAR(10) NOT NULL DEFAULT 'GPS',
    ADD COLUMN image_url    TEXT;

-- challenge_workout: 승인 상태 추가 (GPS 운동은 즉시 APPROVED)
ALTER TABLE challenge_workout
    ADD COLUMN approval_status VARCHAR(10) NOT NULL DEFAULT 'APPROVED';

-- 실내러닝 구성원별 승인 투표
CREATE TABLE indoor_run_approval (
    id                   BIGSERIAL    PRIMARY KEY,
    challenge_workout_id BIGINT       NOT NULL REFERENCES challenge_workout (id) ON DELETE CASCADE,
    voter_user_id        UUID         NOT NULL REFERENCES app_user (id),
    approved             BOOLEAN,                        -- NULL=대기, TRUE=승인, FALSE=거부
    responded_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (challenge_workout_id, voter_user_id)
);
