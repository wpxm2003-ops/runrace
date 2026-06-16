-- V25: 콕 찌르기 하루 1회를 DB 차원에서 보장 (동시 요청으로 제한을 우회하는 푸시 스팸 방지).
-- timestamptz 함수 인덱스는 IMMUTABLE 제약 때문에 쓸 수 없어, 앱이 채우는 sent_on(KST 날짜)로 보장한다.
ALTER TABLE friend_nudge ADD COLUMN sent_on date;
UPDATE friend_nudge SET sent_on = (sent_at AT TIME ZONE 'Asia/Seoul')::date WHERE sent_on IS NULL;
ALTER TABLE friend_nudge ALTER COLUMN sent_on SET NOT NULL;

-- 유니크 인덱스 생성 전, 같은 (보낸이,받는이,날짜) 중복 행은 가장 오래된 1건만 남기고 정리.
DELETE FROM friend_nudge a
    USING friend_nudge b
    WHERE a.sender_id = b.sender_id
      AND a.receiver_id = b.receiver_id
      AND a.sent_on = b.sent_on
      AND a.id > b.id;

CREATE UNIQUE INDEX uq_friend_nudge_daily
    ON friend_nudge (sender_id, receiver_id, sent_on);
