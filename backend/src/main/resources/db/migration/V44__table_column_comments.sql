-- 테이블·컬럼 설명(COMMENT) 일괄 등록 — DB 브라우저(Adminer 등)에서 스키마 의미를 바로 파악하기 위함.
-- 현재 살아있는 20개 테이블 전부. 값은 엔티티 매핑 기준(ddl-auto=validate로 컬럼 존재 보장).

-- ── app_user ────────────────────────────────────────────────────────────────
comment on table app_user is '앱 사용자(회원). 소셜 로그인 기반, 사용자당 1행.';
comment on column app_user.id is '사용자 PK (UUID).';
comment on column app_user.firebase_uid is 'Firebase 인증 UID(고유). 탈퇴 시 재로그인 불가하도록 withdrawn:{id} tombstone으로 대체.';
comment on column app_user.email is '이메일(소셜 제공, 선택). 탈퇴 시 제거.';
comment on column app_user.display_name is '소셜 프로필 표시 이름. 탈퇴 시 제거.';
comment on column app_user.nickname is '앱 내 표시 닉네임. 탈퇴(익명화) 시 null.';
comment on column app_user.provider is '소셜 로그인 제공자(예: kakao).';
comment on column app_user.lang_cd is '언어 선호(ko/en/es/ja/zh). 푸시를 수신자 언어로 보낼 때 사용.';
comment on column app_user.push_enabled is '푸시 수신 선호. 기본 true, false면 모든 푸시(이벤트·리텐션) 미발송.';
comment on column app_user.withdrawn_at is '탈퇴(익명화) 시각. null=정상 회원. 레이스 정합성을 위해 행 자체는 보존.';
comment on column app_user.created_at is '가입 시각.';

-- ── challenge (레이스) ───────────────────────────────────────────────────────
comment on table challenge is '레이스(목표거리 챌린지). 공개 또는 크루 내부 레이스.';
comment on column challenge.id is '레이스 PK.';
comment on column challenge.creator_user_id is '생성자(방장) app_user FK.';
comment on column challenge.start_at is '레이스 시작 일시.';
comment on column challenge.end_at is '레이스 종료 예정 일시. 기한 없는 목표전이면 null.';
comment on column challenge.created_at is '생성 시각.';
comment on column challenge.title is '레이스 제목.';
comment on column challenge.goal_km is '목표 거리(km).';
comment on column challenge.max_members is '최대 참가 인원.';
comment on column challenge.winner_user_id is '승자 app_user FK. 미확정이면 null.';
comment on column challenge.is_ended is '종료 여부.';
comment on column challenge.lang_cd is '생성 시점 작성자 UI 언어로 고정. 공개 목록의 언어별 필터에 사용(번역 아님).';
comment on column challenge.stake is '내기(페널티/보상) 텍스트. 강제·정산 없이 화면 표시용 선택값(null 가능).';
comment on column challenge.crew_id is '크루 내부 레이스면 소속 크루 id(해당 크루 멤버만 참가, 공개 목록 제외). null=일반 공개 레이스.';

-- ── challenge_member (레이스 참가자) ─────────────────────────────────────────
comment on table challenge_member is '레이스 참가자. 사용자의 레이스 참가 1건.';
comment on column challenge_member.id is '참가 PK (UUID).';
comment on column challenge_member.challenge_id is '레이스 FK.';
comment on column challenge_member.user_id is '참가자 app_user FK.';
comment on column challenge_member.total_km is '이 레이스 누적 반영 거리(km).';
comment on column challenge_member.last_sync_at is '누적 거리 마지막 반영 시각.';
comment on column challenge_member.finished_at is '완주(목표 도달) 시각. 미완주면 null.';
comment on column challenge_member.created_at is '행 생성 시각.';
comment on column challenge_member.joined_at is '레이스 참가 시각.';
comment on column challenge_member.final_rank is '종료 시 확정된 최종 순위(1=우승). 진행/모집 중이면 null. 라이벌 전적 도출 기준값.';

-- ── challenge_workout (레이스 반영 운동) ─────────────────────────────────────
comment on table challenge_workout is '레이스에 반영된 운동 기록(레이스×운동 연결).';
comment on column challenge_workout.id is 'PK.';
comment on column challenge_workout.challenge_id is '레이스 FK.';
comment on column challenge_workout.workout_session_id is '반영된 운동(workout_session) FK.';
comment on column challenge_workout.user_id is '참가자 app_user FK.';
comment on column challenge_workout.applied_distance_m is '이 레이스에 반영된 거리(m). 참가 이후 구간만 집계될 수 있음.';
comment on column challenge_workout.created_at is '반영 시각.';
comment on column challenge_workout.approval_status is '승인 상태(APPROVED/PENDING/REJECTED). 실내런은 참가자 승인 필요.';

-- ── challenge_prize (경품) ───────────────────────────────────────────────────
comment on table challenge_prize is '레이스 등수별 경품(기프티콘 등). 이미지는 S3 비공개 키만 보관.';
comment on column challenge_prize.id is 'PK.';
comment on column challenge_prize.challenge_id is '레이스 id(soft 참조).';
comment on column challenge_prize.rank is '경품 등수(1등부터).';
comment on column challenge_prize.name is '경품명. 모두에게 공개.';
comment on column challenge_prize.image_key is 'S3 비공개 객체 키. null=이미지 없는 경품(이름만).';
comment on column challenge_prize.viewed_at is '당첨자 첫 열람(수령) 시각.';
comment on column challenge_prize.created_at is '생성 시각.';

-- ── indoor_run_approval (실내런 승인 투표) ───────────────────────────────────
comment on table indoor_run_approval is '실내런 반영 승인 투표. 참가자별 1표(안티치팅).';
comment on column indoor_run_approval.id is 'PK.';
comment on column indoor_run_approval.challenge_workout_id is '승인 대상 challenge_workout FK.';
comment on column indoor_run_approval.voter_user_id is '투표자 app_user FK.';
comment on column indoor_run_approval.approved is 'null=대기, true=승인, false=거부.';
comment on column indoor_run_approval.responded_at is '투표 응답 시각.';
comment on column indoor_run_approval.created_at is '생성 시각.';

-- ── workout_session (러닝 기록) ──────────────────────────────────────────────
comment on table workout_session is '러닝 기록(운동 세션). GPS 또는 실내런.';
comment on column workout_session.id is 'PK.';
comment on column workout_session.user_id is '사용자 app_user FK.';
comment on column workout_session.started_at is '운동 시작 시각.';
comment on column workout_session.ended_at is '운동 종료 시각.';
comment on column workout_session.duration_sec is '운동 시간(초, 일시정지 제외).';
comment on column workout_session.distance_m is '이동 거리(m).';
comment on column workout_session.calories is '소모 칼로리(추정).';
comment on column workout_session.avg_pace_sec_per_km is '평균 페이스(초/km). 거리 매우 짧으면 null.';
comment on column workout_session.path_json is 'GPS 경로 JSON. lat/lng와 시작 후 경과 ms(t) 배열. 탈퇴 시 빈 배열로 익명화.';
comment on column workout_session.created_at is '생성 시각.';
comment on column workout_session.workout_type is '운동 종류(GPS/INDOOR).';
comment on column workout_session.image_url is '운동 사진 URL(실내런 러닝머신 인증 등). 없으면 null.';
comment on column workout_session.memo is '사용자 메모(선택).';
comment on column workout_session.shoe_id is '이 러닝을 신은 신발(shoe) FK. 신발 삭제 시 null로 풀림.';

-- ── personal_best (개인 최고 기록) ───────────────────────────────────────────
comment on table personal_best is '거리대별 개인 최고 기록(사용자×거리 유니크).';
comment on column personal_best.id is 'PK.';
comment on column personal_best.user_id is '사용자 app_user FK.';
comment on column personal_best.distance_key is '거리 구분(3k/5k/10k/half/marathon).';
comment on column personal_best.best_pace_sec is '해당 거리 최고 페이스(초/km).';
comment on column personal_best.distance_m is '대상 거리(m).';
comment on column personal_best.workout_id is '기록 달성 운동(workout_session) FK.';
comment on column personal_best.achieved_at is '달성(갱신) 시각.';

-- ── daily_distance (일자별 거리 집계) ────────────────────────────────────────
comment on table daily_distance is '일자·소스별 거리 집계. 헬스 동기화 등 외부 소스 반영 대비.';
comment on column daily_distance.id is 'PK (UUID).';
comment on column daily_distance.user_id is '사용자 app_user FK.';
comment on column daily_distance.date is '집계 날짜.';
comment on column daily_distance.source is '데이터 소스 식별자.';
comment on column daily_distance.distance_km is '해당 날짜·소스 거리(km).';
comment on column daily_distance.created_at is '생성 시각.';
comment on column daily_distance.updated_at is '마지막 갱신 시각.';

-- ── device_token (푸시 기기 토큰) ────────────────────────────────────────────
comment on table device_token is '푸시 발송용 기기 토큰. 사용자×플랫폼 유니크.';
comment on column device_token.id is 'PK (UUID).';
comment on column device_token.user_id is '사용자 app_user FK.';
comment on column device_token.platform is '기기 플랫폼(android/ios/web 등).';
comment on column device_token.fcm_token is 'FCM 등록 토큰.';
comment on column device_token.updated_at is '토큰 마지막 갱신 시각.';

-- ── friend_nudge (콕 찌르기) ─────────────────────────────────────────────────
comment on table friend_nudge is '콕 찌르기(독려) 기록. 같은 레이스 참가자끼리 하루 1회.';
comment on column friend_nudge.id is 'PK.';
comment on column friend_nudge.sender_id is '보낸 사람 app_user FK.';
comment on column friend_nudge.receiver_id is '받는 사람 app_user FK.';
comment on column friend_nudge.message is '콕 찌르기 메시지(프리셋 문구).';
comment on column friend_nudge.sent_at is '발송 시각.';
comment on column friend_nudge.sent_on is '발송 KST 날짜. (sender, receiver, sent_on) 유니크로 하루 1회 보장.';

-- ── rival (라이벌) ───────────────────────────────────────────────────────────
comment on table rival is '라이벌(팔로우식 단방향). user가 rival_user를 등록(수락 불필요).';
comment on column rival.id is 'PK.';
comment on column rival.user_id is '라이벌을 등록한 사람 app_user FK.';
comment on column rival.rival_user_id is '라이벌로 지목된 사람 app_user FK.';
comment on column rival.created_at is '등록 시각.';

-- ── shoe (신발) ──────────────────────────────────────────────────────────────
comment on table shoe is '러닝화. 활성 신발 1개로 이후 러닝이 자동 귀속.';
comment on column shoe.id is 'PK.';
comment on column shoe.user_id is '소유자 app_user FK.';
comment on column shoe.brand is '브랜드.';
comment on column shoe.model is '모델명.';
comment on column shoe.nickname is '별칭(선택). 표시용.';
comment on column shoe.target_distance_m is '교체 권장 목표 거리(m). null=알림 없음.';
comment on column shoe.is_active is '활성 신발 여부(이후 러닝 자동 귀속 대상).';
comment on column shoe.created_at is '등록 시각.';

-- ── training_plan (NSM 훈련 플랜) ────────────────────────────────────────────
comment on table training_plan is 'NSM(Norwegian Singles) 훈련 플랜. 사용자당 1개. 주간 스케줄은 프론트가 결정적 생성.';
comment on column training_plan.id is 'PK.';
comment on column training_plan.user_id is '사용자 id (유니크).';
comment on column training_plan.vdot is 'Daniels VDOT(레이스 기록에서 산출).';
comment on column training_plan.threshold_pace_sec is '역치(threshold) 페이스(초/km).';
comment on column training_plan.sessions_per_week is '주간 sub-T 세션 수(2~3). sub_t_days 개수와 일치.';
comment on column training_plan.sub_t_days is 'sub-T 요일 CSV(월=0 … 일=6). 예: 1,3,5.';
comment on column training_plan.source_distance_m is '계산 기준 레이스 기록 거리(m). 재계산·표시용.';
comment on column training_plan.source_time_sec is '계산 기준 레이스 기록 시간(초).';
comment on column training_plan.created_at is '생성 시각.';
comment on column training_plan.updated_at is '마지막 갱신 시각.';

-- ── system_push_history (시스템 푸시 이력) ───────────────────────────────────
comment on table system_push_history is '시스템 푸시 발송 이력(리텐션·스트릭 등). 중복 발송 방지에 사용.';
comment on column system_push_history.id is 'PK.';
comment on column system_push_history.user_id is '수신자 app_user id.';
comment on column system_push_history.push_type is '푸시 종류 식별자.';
comment on column system_push_history.title is '푸시 제목.';
comment on column system_push_history.body is '푸시 본문.';
comment on column system_push_history.sent_at is '발송 시각.';

-- ── app_error_log (에러 로그) ────────────────────────────────────────────────
comment on table app_error_log is '프론트엔드·백엔드 에러 통합 로그(운영 조회용).';
comment on column app_error_log.id is 'PK (UUID).';
comment on column app_error_log.source is '출처(frontend/backend).';
comment on column app_error_log.message is '에러 메시지.';
comment on column app_error_log.stack is '스택트레이스(선택).';
comment on column app_error_log.context is '부가 컨텍스트(프론트: url·userAgent·kind / 백엔드: method·path).';
comment on column app_error_log.user_id is 'app_user에 대한 soft 참조(FK 없음). 비로그인 보고는 null.';
comment on column app_error_log.request_id is '요청 추적 ID(사용자가 본 에러와 로그 행 연결).';
comment on column app_error_log.error_code is '도메인 에러 식별자(ApiException.code 등). source=api 행에만 채워짐.';
comment on column app_error_log.created_at is '기록 시각.';

-- ── crew (크루) ──────────────────────────────────────────────────────────────
comment on table crew is '러닝 크루(팀). 사용자당 1개 소속, 리더가 관리.';
comment on column crew.id is 'PK.';
comment on column crew.name is '크루명.';
comment on column crew.notice is '리더가 설정하는 고정 공지 한 줄(정모 일정 등).';
comment on column crew.join_code is '초대 코드(혼동 문자 제외 6자). 받는 사람이 입력해 가입.';
comment on column crew.leader_user_id is '리더 app_user FK.';
comment on column crew.max_members is '최대 인원.';
comment on column crew.week_goal_km is '크루원 1인당 주간 목표 거리(km). null=목표 없음.';
comment on column crew.created_at is '생성 시각.';

-- ── crew_member (크루 멤버십) ────────────────────────────────────────────────
comment on table crew_member is '크루 멤버십(사용자당 1개). 리더도 멤버 행을 가짐.';
comment on column crew_member.id is 'PK.';
comment on column crew_member.crew_id is '크루 FK.';
comment on column crew_member.user_id is '멤버 app_user FK.';
comment on column crew_member.joined_at is '가입 시각.';

-- ── crew_match (크루 대항전) ─────────────────────────────────────────────────
comment on table crew_match is '크루 대항전(총거리전). 기간 내 로스터 합산 거리가 큰 쪽 승리.';
comment on column crew_match.id is 'PK.';
comment on column crew_match.challenger_crew_id is '도전(도전장 작성) 크루 FK.';
comment on column crew_match.opponent_crew_id is '상대 크루 FK.';
comment on column crew_match.status is '상태(PENDING=수락 대기 / ACCEPTED=수락 / DECLINED=거절).';
comment on column crew_match.roster_size is '양 크루 출전 인원(동수 강제).';
comment on column crew_match.start_at is '대결 시작 일시(도전장 작성 시 확정).';
comment on column crew_match.end_at is '대결 종료 일시.';
comment on column crew_match.is_ended is '종료 확정 여부.';
comment on column crew_match.winner_crew_id is '승자 크루 id. 무승부·미확정이면 null.';
comment on column crew_match.created_at is '생성(도전장 발송) 시각.';

-- ── crew_match_roster (대항전 출전 명단) ─────────────────────────────────────
comment on table crew_match_roster is '대항전 출전 명단 한 자리(러너 1명).';
comment on column crew_match_roster.id is 'PK.';
comment on column crew_match_roster.match_id is '대항전(crew_match) FK.';
comment on column crew_match_roster.crew_id is '출전 소속 크루 id.';
comment on column crew_match_roster.user_id is '출전 러너 app_user FK.';
