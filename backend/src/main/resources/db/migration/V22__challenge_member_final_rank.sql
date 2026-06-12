-- 레이스 종료 시 확정되는 최종 순위(1=우승). 종료 시점에 동결되어 이후 운동 수정에도 흔들리지 않는다.
-- 전적(head-to-head)은 별도 테이블 없이 이 칼럼을 self-join 비교해 도출한다.
-- 진행 중·모집 중인 레이스는 null.
alter table challenge_member
  add column final_rank int;

-- "나 vs 상대 전적" 쿼리: 끝난 레이스에서 두 멤버의 final_rank를 비교한다.
create index idx_challenge_member_user_final_rank
  on challenge_member (user_id, final_rank)
  where final_rank is not null;
