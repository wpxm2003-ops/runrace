-- 레이스 등수별 경품(기프티콘/쿠폰). 이미지는 비공개 키만 저장하고 게이트 엔드포인트로만 서빙.
create table challenge_prize (
  id bigserial primary key,
  challenge_id bigint not null references challenge(id) on delete cascade,
  rank int not null check (rank >= 1),
  name varchar(60) not null,
  -- S3 비공개 객체 키(공개 URL 아님). null이면 이미지 없는 경품(이름만).
  image_key varchar(200),
  -- 당첨자가 기프티콘을 처음 열람한 시각(수령 표시용).
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, rank)
);

create index idx_challenge_prize_challenge on challenge_prize (challenge_id, rank);
