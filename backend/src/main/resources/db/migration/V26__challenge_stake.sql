-- 레이스 내기(페널티/보상) 텍스트. 선택값(없으면 NULL).
-- 강제·정산 없는 사회적 표시용 — 예: "꼴찌가 커피 사기", "승자 배지".
ALTER TABLE challenge ADD COLUMN stake VARCHAR(100);
