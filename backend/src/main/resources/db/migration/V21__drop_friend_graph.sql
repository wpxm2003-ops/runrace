-- 친구 그래프 제거: 레이스 참가자 간 콕 찌르기(nudge)로 대체하여 친구 관계가 불필요해짐.
-- 콕 찌르기 기록(friend_nudge)은 app_user만 참조하므로 유지한다.
drop table if exists friend_invite;
drop table if exists friendship;
