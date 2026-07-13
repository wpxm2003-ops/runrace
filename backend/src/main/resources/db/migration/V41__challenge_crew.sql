-- 크루 내부 레이스(C0.5) — crew_id가 있으면 해당 크루 멤버만 참가 가능하고 공개 목록에서 제외된다.
-- 크루 해체 시 SET NULL → 기존 참가자들의 일반 레이스로 남는다(기록·전적 보존 원칙).
alter table challenge add column crew_id bigint references crew(id) on delete set null;

-- 크루 레이스 목록 조회 가속(크루 레이스인 행만 인덱싱).
create index idx_challenge_crew on challenge (crew_id) where crew_id is not null;
