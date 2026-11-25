# 분석 이벤트·측정 정리

RunRace가 남기는 사용 측정값을 한곳에 모은 문서다. 측정은 두 갈래로 나뉜다.

| 갈래 | 어디에 쌓이나 | 무엇을 보나 |
| --- | --- | --- |
| GA4(Firebase Analytics 웹 SDK) | Google Analytics | 이벤트 흐름, 세션, 플랫폼별 사용 |
| 서버 일일 활성 기록 | `user_daily_active`(Flyway V75) | DAU·WAU·MAU, 가입 코호트 재방문율(관리자 화면 `/sb`) |

GA4 코드는 `frontend/src/lib/analytics.ts` 하나에 있다. 앱(Android)도 WebView에서 같은 웹 SDK를 쓰므로 프론트 배포만으로 앱에 반영된다. `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`가 없으면 전부 아무 일도 하지 않는다.

## 1. 부팅·세션 (2026-11 추가)

`AnalyticsBootstrap`(`frontend/src/app/_components/AnalyticsBootstrap.tsx`)이 `AppShell`에 한 번 마운트되어 아래 일을 한다.

| 항목 | 언제 | 내용 |
| --- | --- | --- |
| GA4 초기화 | 앱 부팅(첫 렌더 직후) | `initializeAnalytics`. 이때 GA4가 `page_view`를 보내고 `session_start`·`first_visit`을 만든다. 예전에는 첫 `track()` 때야 초기화돼 이벤트 없이 나간 방문이 DAU에서 빠졌다. |
| 사용자 속성 `platform` | 초기화 config에 포함 | `android_app`(Capacitor Android 앱) · `ios_web`(아이폰·아이패드 브라우저/PWA) · `web`(그 밖의 브라우저, 안드로이드 모바일 웹 포함). 판정: `frontend/src/lib/clientPlatform.ts`. iOS 네이티브 앱은 없다. |
| 사용자 ID | 로그인 상태가 정해질 때마다 | `setAnalyticsUser(Firebase UID)`. 로그인 순간뿐 아니라 자동 로그인 복원 때도 호출하고, 로그아웃이면 `null`로 해제한다. 로그인 화면들의 기존 호출도 그대로 남아 있다(중복 호출은 무해). |
| 일일 활성 핑 | 부팅 + 포그라운드 복귀 | 아래 2절. 로그인 사용자만. |

SPA 안에서 화면을 옮길 때의 `page_view`는 GA4 웹 스트림의 향상된 측정("브라우저 기록 이벤트 기반 페이지 변경")이 켜져 있으면 자동으로 잡힌다. 코드에서 따로 보내지 않는다.

`platform`을 GA4 보고서에서 쓰려면 GA4 관리 → 맞춤 정의에서 **사용자 범위 맞춤 측정기준**으로 `platform`을 등록해야 한다(표시 이름은 기본 측정기준 "플랫폼"과 헷갈리지 않게 "클라이언트 플랫폼" 등으로). 등록 전 데이터도 속성 자체는 수집된다.

## 2. 서버 일일 활성 핑

- 엔드포인트: `POST /api/activity/ping` (인증 필수), 본문 `{ "platform": "android_app" | "web" | "ios_web" }`
- 응답: `{ "localDate": "yyyy-MM-dd", "recorded": true|false }` — `recorded=false`면 그 날 이미 기록된 것
- 클라이언트(`frontend/src/lib/activityPing.ts`): 부팅·포그라운드 복귀(앱 `appStateChange`, 웹 `visibilitychange`) 때 부르되, 마지막 성공을 `localStorage`의 `runrace_activity_ping`(`uid|기기 현지 날짜`)에 기억해 하루 한 번만 보낸다. 실패하면 기억하지 않아 다음 복귀 때 다시 보낸다. 401이어도 로그인 화면으로 보내지 않는다.
- 서버: 사용자 현지 날짜(`users.time_zone`, 비었거나 잘못됐으면 `Asia/Seoul`)로 `(user_id, local_date, platform)` 한 행을 `insert … on conflict do nothing`. 같은 날 여러 번, 동시에 와도 한 행이다.
- 저장 값: 사용자 ID, 현지 날짜, 플랫폼, 그 날 첫 핑을 받은 서버 시각. **IP·기기 정보·위치·정확한 사용 시각 흐름은 저장하지 않는다.**
- 보존: 활동 이력과 같은 `runrace.history.retention-days`(기본 365일). `DailyActiveRetentionScheduler`가 매일 04:30 UTC에 정리한다.
- 탈퇴: 탈퇴 익명화 트랜잭션(`AccountWithdrawalTx`)에서 그 사용자의 행을 모두 지운다(개인정보처리방침의 "탈퇴 시 지체 없이 파기"). 그래서 방문 기준 과거 수치는 탈퇴가 생기면 소급해 조금 줄 수 있다.

### 관리자 화면 `/sb` 지표 정의

`GET /api/admin/retention`(관리자 전용)이 계산하고 화면에도 같은 정의를 적어 두었다.

- 날짜는 모두 **사용자 현지 날짜**, "오늘"은 KST 기준. 운영자 계정(대시보드 목록과 같은 이름 목록)은 뺀다.
- 두 기준을 나란히 낸다.
  - **방문 기준**: `user_daily_active` — 로그인 상태로 앱·웹을 연 날. 배포 이후부터 쌓인다.
  - **달리기 기준**: `workout_session.started_at_local`의 날짜 — 운동을 시작한 날. 과거 데이터로 바로 계산된다.
- 오늘 DAU: 오늘 활동한 사용자 수(오늘은 진행 중).
- 최근 7일 평균 DAU: 오늘을 뺀 어제까지 7일의 일평균. 방문 기준은 수집이 완결되지 않은 날(첫 핑 전 시간이 섞인 날)을 빼고 평균한다.
- WAU / MAU: 오늘 포함 최근 7일 / 30일 동안 한 번이라도 활동한 사용자 수. 방문 수집이 7일·30일보다 짧으면 화면에 "부분값"으로 표시한다.
- 최근 7일 신규 가입: 현지 가입일이 오늘 포함 최근 7일인 가입자.
- 가입 주 코호트: 현지 가입일 기준 월~일, 최근 8주. 탈퇴 회원 포함.
- **D-n 재방문율**: 가입 후 **정확히 n일째**(가입일 다음 날이 D1) 현지 날짜에 활동한 가입자 비율. 그 사이 다른 날 활동은 세지 않는다.
  - 그 날이 사용자 현지 기준으로 아직 끝나지 않았으면 분모에서 뺀다.
  - 방문 기준은 수집 시작(첫 핑) 전 시간이 섞인 날짜도 판정하지 않는다. 구체적으로 첫 핑 시각을 UTC+14로 본 날짜의 다음 날부터 판정한다 — 보통 배포 당일까지 빠지고, KST 19시 이후에 배포하면 다음 날까지 빠진다.
  - 판정할 사람이 없으면 `—`(0%가 아님). 칸에는 `비율 (활동/판정 가능)`을 함께 쓴다.

## 3. GA4 이벤트 목록

기존 이벤트 이름은 바꾸지 않는다. 새 이벤트를 더할 때는 이 표에도 한 줄 더한다. 파일 경로는 `frontend/src/` 기준.

### 로그인·가입

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `sign_up` | `method`: `google` \| `kakao` | `app/login/page.tsx`, `app/_components/AuthRedirectHandler.tsx`(google), `lib/kakaoAuth.ts`(kakao, 앱) | 로그인 직후 Firebase 계정 생성 시각과 마지막 로그인 시각이 10초 이내일 때 |
| `login` | `method`: `google` \| `kakao` | 위 세 곳 + `app/kakao/callback/page.tsx`(kakao, 웹) | 로그인 완료 |

알려진 빈틈: 웹 카카오 로그인(`app/kakao/callback/page.tsx`)은 `login`만 보내고 `sign_up`은 보내지 않는다. 신규 가입 수는 서버 `users.created_at`으로 세는 것이 정확하다(`/sb` 카드).

### 알림·설정

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `push_opened` | `type`: 푸시 데이터의 `type`(없으면 `unknown`) | `app/_components/FcmBootstrap.tsx` | 앱에서 알림을 탭했을 때 |
| `push_toggle` | `enabled`: boolean | `app/my/_components/NotificationToggle.tsx` | 내 정보에서 알림 켜고 끄기 성공 |
| `live_progress_toggle` | `scope`: `publicEnabled` \| `crewEnabled`, `enabled`: boolean | `app/my/_components/LiveProgressToggle.tsx` | 실시간 진행률 공개 설정 변경 성공 |

### 레이스·라이벌

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `race_created` | `crew`: boolean | `app/challenges/create/page.tsx` | 레이스 생성 성공 |
| `race_joined` | `challengeId`, `crew`: boolean, `goal_km` | `app/challenges/_components/ChallengeDetailContent.tsx` | 레이스 참가 성공 |
| `rival_added` | — | `app/rivals/_components/RivalAddSection.tsx` | 라이벌 추가 성공 |

### 크루

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `crew_created` | — | `app/crew/_components/CrewOnboarding.tsx` | 크루 만들기 성공 |
| `crew_joined` | `method`: `code` | `app/crew/_components/CrewOnboarding.tsx` | 초대 코드로 가입 성공 |
| `crew_join_requested` | — | `app/crew/_components/CrewDetailContent.tsx` | 공개 크루 가입 신청 |
| `crew_join_approved` | — | `app/crew/_components/JoinRequestInbox.tsx` | 리더가 가입 신청 승인 |
| `crew_invite_copied` | — | `app/crew/_components/CrewHeaderSection.tsx` | 초대 코드·안내 문구 복사 |
| `crew_nudge_sent` | `variant`: 문구 프리셋 번호 | `app/crew/_components/CrewBoardSection.tsx` | 크루원 찌르기 성공 |
| `crew_match_sent` | `roster_size` | `app/crew/challenge/page.tsx` | 크루 대항전 신청 |
| `crew_match_accepted` | — | `app/crew/match/page.tsx` | 대항전 수락 |
| `crew_match_declined` | — | `app/crew/match/page.tsx` | 대항전 거절 |

### 러닝·기록

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `running_start` | — | `lib/useWorkoutSessionControls.ts` | GPS 러닝 시작 |
| `running_pause` | — | `lib/useWorkoutSessionControls.ts` | 일시정지 |
| `running_auto_pause` | — | `lib/useWorkoutSession.ts` | 오래 움직임이 없어 자동 일시정지 |
| `running_gps_watch_restart` | `reason`: `foreground` \| `stale` | `lib/useWorkoutSession.ts` | GPS 감시 재시작(앱 복귀, 위치 끊김) |
| `running_end` | `distance_km`, `duration_sec`, `pace`(초/km, 없으면 0), `calories` | `app/workout/_components/useWorkoutSave.ts` | GPS 러닝 저장 성공 |
| `record_saved` | `distance_bucket`: `under_1km` \| `1_3km` \| `3_5km` \| `over_5km`, `type`: `indoor`(실내런만) | `app/workout/_components/useWorkoutSave.ts`(GPS), `app/workout/indoor/page.tsx`(실내) | 기록 저장 성공 |
| `ghost_race_started` | — | `app/workout/_components/useWorkoutGhostRace.ts` | 고스트 레이스 시작 |
| `ghost_race_completed` | `ghost_workout_id`, `result`: `win` \| `loss` \| `tie`, `delta_sec`, `overlap_m` | `app/workout/_components/useWorkoutSave.ts` | 고스트 레이스가 걸린 러닝 저장 |
| `weekly_report_view` | — | `app/records/page.tsx` | 기록 화면에서 주간 통계 열기 |
| `recap_card_saved` | — | `app/records/_components/MonthlyRecapCard.tsx` | 월간 리캡 카드 저장 |

### 공유

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `share_view` | `workoutType` | `app/workouts/[id]/share/_components/WorkoutShareContent.tsx` | 공유 링크 페이지 열람 |
| `share_cta_click` | `workoutType` | 같은 파일 | 공유 페이지의 "나도 시작하기" 버튼(→ 로그인) |
| `photo_card_saved` | `workoutType`, `layout`, `action`: `upload` \| `download` | `app/workouts/_components/PhotoStatsCard.tsx` | 사진 기록 카드 저장 |

### 훈련(NSM)

| 이벤트 | 파라미터 | 발생 위치 | 시점 |
| --- | --- | --- | --- |
| `nsm_plan_saved` | `weekly_band`(없으면 `unknown`) | `app/training/_hooks/useTrainingPlanBuilder.ts` | 훈련 계획 저장 |
| `nsm_cta_shown` | — | `app/workout/_components/WorkoutCelebration.tsx` | 러닝 축하 화면에 훈련 유도 카드가 실제로 보였을 때(고스트 결과가 있을 때, 7일 1회) |
| `nsm_cta_click` | — | 같은 파일 | 훈련 유도 카드 클릭(→ 훈련 화면) |
| `nsm_block_view` | — | `app/training/report/[id]/_components/NsmBlockReportContent.tsx` | 블록 리포트 열람 |
| `nsm_block_image_saved` | — | 같은 파일 | 블록 리포트 이미지 저장 |
| `nsm_block_cta_click` | — | 같은 파일 | 공유된 블록 리포트의 시작하기 버튼(→ 로그인) |

합계 36종(2026-11-25 기준).
