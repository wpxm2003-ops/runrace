-- 내기 문구 최대 길이 100 → 30자
UPDATE challenge
SET stake = LEFT(stake, 30)
WHERE stake IS NOT NULL AND char_length(stake) > 30;

ALTER TABLE challenge
  ALTER COLUMN stake TYPE VARCHAR(30);
