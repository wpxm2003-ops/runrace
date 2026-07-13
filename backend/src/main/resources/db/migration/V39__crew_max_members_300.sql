-- 크루 정원 30 → 300 확대. 기존 크루(현재는 테스트 데이터뿐)도 일괄 상향한다.
alter table crew alter column max_members set default 300;
update crew set max_members = 300;
