# 리팩토링 현황 기록 (2026-08-21, 6차 갱신)

> 목적: 다음 리팩토링 때 처음부터 재점검하는 수고를 덜기 위한 스냅샷.
> 이 문서의 "하지 않은 것 + 이유"가 핵심 — 겉보기에 중복 같지만 실제로는 다른 것들을 다시 조사하지 말 것.
> 1차 커밋 범위: `63cf0c2..7fb82b3`(19커밋). 2차(다음 후보 소화) 커밋 범위: `7c04fdc..2127724`(15커밋).
> 3차 조사 범위: `2127724..f87c08d`(74커밋/218파일/+10528줄) — 2차 이후 신규 코드 전체.
> 4차 조사 범위: `f87c08d..HEAD`(66커밋/206파일/+7154줄) — 고도 기능 제거·패턴 A·글로벌 대응 이후. §9 참조.
> 5차 조사 범위: 코드베이스 **전체 재스캔**(증분 아님) — 6렌즈 병렬(UI/lib/백엔드/죽은코드/계약정합/구조·테스트). §10 참조.
> 6차 조사 범위: `0790f89..HEAD`(20커밋/135파일/+3895줄) — UI 전면 개편·홈 대시보드·활동 이력·안드로이드 추적 강화 이후. §12 참조. §10 미결 항목 중 셋을 함께 소화했다.
> 전 커밋이 게이트(tsc `--noEmit` / eslint / next build / vitest / mvnw test) 통과.

## 1. 완료된 것 — 신설 공용 모듈 (1차, 2026-07-22 오전)

| 모듈 | 역할 | 소비처 수 |
|---|---|---|
| `frontend/src/app/_components/ui/BottomSheet.tsx` | 바텀시트 오버레이+stopPropagation+useNativeBack 소유. zIndexClass/panelClassName은 리터럴로 주입 | 8 (ApplyModal, RejectModal, PrizeEditorModal, ShoeFormSheet 메인, CrewRegionPickerSheet, SelectSheet 경유 2곳) |
| `frontend/src/app/_components/ui/Badge.tsx` | amber(리더/라이벌)·emerald(나/참여중) 2톤 뱃지 | 13곳 |
| `frontend/src/app/_components/ImageLightbox.tsx` | 멀티이미지 갤러리 뷰어(스와이프+카운터+useNativeBack+zIndexClass). 단일 이미지면 자동 축퇴 | CrewDetailContent, ChallengeDetailContent, ChallengePrizes(경품 이미지, z-120) |
| `frontend/src/lib/api/errorMap.ts` `mapErrorMessage(e, rules, fallback)` | 에러코드→i18n 매핑 루프. **fallback은 반드시 함수**(reportAndDisplay 부수효과 방지) | 16곳 |
| `frontend/src/lib/format.ts` 추가분 | `shortMonthDay`(date-only 전용)·`addDaysIso`·`todayIso`·`monthDayLabel` | crew 계열 |
| `frontend/src/lib/api/hooks.ts` `SWR_INFINITE_CONFIG` | useSWRInfinite 공통 옵션(무한스크롤 5훅 전부 사용) | 5 |
| `frontend/src/app/crew/_components/` | crew/page.tsx 1206→80줄, settings 726→161줄로 분해된 컴포넌트들 | — |
| `backend .../common/KstTime.ZONE` | Asia/Seoul ZoneId 단일 출처 (5개 서비스) | 5 |
| `backend .../common/PageParams.clamp(page,size)` | page≥0, 1≤size≤50 클램핑 단일 출처 | 컨트롤러 4 + 서비스 2 |
| `backend .../crew/service/CrewGuards` | requireMembership 공유(2차에서 public 승격, 아래 참조) | CrewService, CrewMatchService, ChallengeService, NudgeService |
| `backend` CrewService→`ForbiddenTextChars` | 자체 char 배열 폐기, 제어문자까지 차단(검증 강화) | — |
| `backend` CrewMatchService `finalizeIfNeeded` | "ACCEPTED+기간종료→확정" 4곳 통합, end_at null 방어 포함 | 4 |

## 2. 완료된 것 — 다음 후보 소화 (2차, 2026-07-22 오후, `7c04fdc..2127724`)

| 모듈/작업 | 내용 | 커밋 |
|---|---|---|
| `crew/_components/CrewMatchStatusBadge.tsx` | crew/matches 목록 + crew/match 상세의 상태→라벨/색 매핑 중복 통합. **⚠️ 상세 페이지 IN_PROGRESS 색 emerald→sky**(ChallengePhaseBadge·CrewHome 레이스 톤·목록 페이지 3곳이 이미 sky — 상세 쪽이 컨벤션 이탈 버그였음) | `7c04fdc` |
| `_components/ui/SelectSheet.tsx` | CrewRegionPickerSheet + ShoeFormSheet 브랜드 시트 통합. title 유무로 헤더 렌더링 분기. **⚠️ 브랜드 시트 체크 표시 "✓"→SVG 아이콘**(순수 장식) | `791d66e` |
| `_components/ui/TextInput.tsx` (`TextInput`/`TextArea`) | `rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:...` 18개 input/textarea(11파일) 중복 제거. 폭/여백은 콜사이트별 className으로 이어붙임(겹치는 유틸리티 클래스 없어 순수 이동) | `dc5ff96` |
| GifticonViewer → ImageLightbox | ChallengePrizes 로컬 뷰어를 공용 컴포넌트로 교체. ImageLightbox에 `zIndexClass` prop 신설(z-120 유지). **⚠️ 닫기버튼 스타일 변경**(기능은 동일) | `78a8138` |
| `not_in_crew` 상태코드 통일 | CrewGuards(404)·ChallengeService(400)·NudgeService(403) 3곳이 각자 findByUserId+orElseThrow를 중복 구현하던 것 확인 → CrewGuards를 `public`으로 승격하고 나머지 둘이 위임. **⚠️ Challenge/Nudge의 not_in_crew 응답이 400/403→404**(양쪽 다 프론트가 상태코드 분기 없이 에러를 문자열화만 해서 사용자 영향 없음 확인. 기존 테스트도 이 경로 상태코드를 단정한 게 없었음) | `fd81969` |
| `_components/ui/AsyncList.tsx` | shoes/my/rivals 3곳의 "로딩→스켈레톤, 비어있음→안내문구, 아니면 목록" 3분기 통합(렌더프롭). 에러 표시(Alert)는 콜사이트마다 소스가 달라(my는 `String()`, 나머지는 `toDisplayError()`) 범위 밖 — **별도 이슈로 남겨둠** | `1febce9` |
| `crew/_components/CrewLoadState.tsx` `crewLoadState()` | crew/page·crew/settings의 useMyCrew 에러/로딩 조기반환 블록이 바이트 단위로 동일 — 일반 함수로 추출(컴포넌트 아님) | `010dfe1` |
| 알림 코스메틱 3건 | `CrewMatchNotifications.matchLink()`(링크 리터럴 5회 통합, ChallengeNotifications의 challengeLink 선례를 따름) / `NotificationVariants.randomKey()`(변형키 랜덤선택 3곳 통합) / `MilestoneReachedEvent`·`RankOvertakeEvent`·`ChallengeEndedEvent`·`ChallengeEndedNoParticipantsEvent` 최상위 파일 4개를 `ChallengeEvents` 중첩 record로 이동(기존 PrizeImagesOrphanedEvent·CrewMatchEvents 선례와 통일, 소비 파일 4곳은 import 경로만 변경) | `f693cc7` |
| 백엔드 테스트 공백 6개 서비스 | 아래 §5 참조 | `d4a1d86`~`2127724` |

리팩토링 중 발견·수정된 실버그(1차 3건 + 2차 1건):
- `GET /api/challenges`·`/mine`이 page 클램핑 누락 → 음수 page가 500+에러로그 오염 (`523f5e3`, 1차)
- errorMap fallback 즉시평가였으면 처리된 에러마다 리포트 중복 발송 (`6077ee0`에서 설계로 차단, 1차)
- eslint가 `android/` 빌드 산출물을 스캔해 가짜 에러로 실제 결과를 가림 (`5f01273`, 1차)
- **CrewMatchStatusBadge 색 불일치**(상세 페이지만 emerald, 나머지 3곳은 sky) — `7c04fdc`에서 sky로 통일(2차)

## 3. 의도적으로 하지 않은 것 (재조사 금지 목록)

### 프론트
| 항목 | 이유 |
|---|---|
| `MatchRow` vs `HistoryRow` 병합 | 이름만 비슷. 전자는 사전 포맷 텍스트 한 줄+화살표(홈 요약), 후자는 match 객체에서 상대·상태·기간·결과를 파생하는 카드(내역). 중복 아님 |
| `crew/match/page.tsx:30` `shortDate` | datetime+TZ 입력을 `new Date()`로 파싱 — date-only `split("-")` 전용인 `shortMonthDay`와 계약이 다름. 합치면 날짜 하루 밀림 |
| `useAsyncAction` 훅 | 30콜사이트의 busy 모양·confirm 유무·리포트 방식·성공경로 순서가 제각각 |
| `useImageUpload` 훅 | 4곳 동작이 실제로 다름(WorkoutPhotoButton/ProfileSection/PrizeEditorModal/ImageUploadField) |
| WorkoutPhotoButton 내장 뷰어 → ImageLightbox | 뷰어에 변경/삭제 액션 푸터가 내장 — ImageLightbox에 액션 슬롯 추가 설계가 선행돼야 함 |
| FilterChip (RegionChip↔요일칩 통합) | padding·shrink-0·transition-colors 실제 차이 |
| `nudge_daily_limit` 에러 분기 2곳 | 메시지 선택이 아니라 `setNudgedIds` 상태변경 부수효과 포함 |
| `isAuthError`/`isNotFoundError` | boolean 분류 헬퍼지 에러→메시지 매핑이 아님 |
| 중앙정렬 다이얼로그·풀스크린 오버레이 | 바텀시트 구조가 아님 |
| `WelcomeOnboarding:52` | 의도적으로 백드롭 탭 닫기 없음(비-dismissible 온보딩) |
| training 페이지 zinc 커스텀 태그 | Badge는 amber/emerald 2톤 설계 — 범위 밖 |
| `lib/workoutTrack.ts`·`lib/api/types.ts` | 단일 관심사/타입 정의 — 분해 실익 낮음 |
| **`lib/api/hooks.ts`(595줄, 훅 33개) 도메인별 분리** | (2차 검토) barrel re-export로 콜사이트 무변경 가능하지만, 파일 정리일 뿐 실질 중복 제거가 아니라 백엔드 테스트 공백보다 낮은 우선순위로 판단 — 미착수 |
| **"별도 backdrop + fixed 하단 패널" 3종**(`DateTimePickerSheet`, `GhostPicker`, `RecordsStatsPanel`) | (2차 재검토) 이미 각자 `useNativeBack` 보유(신규 이관 이점 없음). BottomSheet와 DOM 구조가 다름(형제 div 2개 vs 중첩 flex-center 1개), z-index 스케일 다름(z-40/50 vs z-100대), backdrop 블러·투명도 다름(bg-black/40 vs /45+blur), 반응형 중앙정렬 유무 다름(BottomSheet는 sm:items-center, 이 3종은 항상 하단고정). 이관하려면 시각 재설계 필요 — 순수 이동 불가 |

### 백엔드
| 항목 | 이유 |
|---|---|
| 네이티브 SQL 12개 → QueryDSL 이관 | KST 날짜 집계·CTE·윈도우 함수라 QueryDSL로 표현 불가/위험 |
| `@Scheduled(zone="Asia/Seoul")` 문자열 잔존 | 애노테이션 속성은 컴파일 상수만 |
| SQL 내 `at time zone 'Asia/Seoul'` | SQL 리터럴, Java 상수와 무관 |
| CrewService 월요일정렬 주시작 vs ReengagementScheduler 롤링7일 | 다른 개념 — 경계 계산 통합 금지 |
| `TextValidation.requireCleanText` 전면 채택 | blank→null 시맨틱 미지원 + 에러코드 형태 상이 |
| `Clock` 주입(`OffsetDateTime.now()` 75회/29파일) | 전 서비스 생성자+Mockito 세팅 전면 변경 필요 |
| `WorkoutService.java:145` `Math.max(1, ...)` | 칼로리 하한이지 페이지네이션 아님 |
| **JPQL 텍스트블록(`"""`) vs `"..." + "..."` 혼용**(2차 검토, 8곳: CrewMatchRepository ×2, CrewMemberRepository ×1, WorkoutSessionRepository ×2, CrewJoinRequestRepository ×3) | 순수 스타일 통일이지만 JPQL 문자열 내용 자체를 옮겨적어야 해서(공백/개행 오차 시 쿼리가 조용히 달라질 위험) 이득 대비 위험이 큼 — 미착수 |
| **KakaoAuthService 테스트**(2차 검토) | `HttpClient httpClient = HttpClient.newHttpClient()`가 생성자 주입이 아닌 필드 초기화라 목 주입 불가. 테스트 가능하게 하려면 생성자 시그니처를 바꿔야 함(프로덕션 코드 변경) — "테스트 추가" 범위를 벗어나 별도 승인 필요. UserProvisioningService(같은 auth 패키지, Firebase 미의존)는 정상적으로 커버함(`2127724`) |

## 4. 남은 후보 (우선순위순, 대부분 낮음)

> 3차(§7) 이후 갱신. **가치가 높다고 판단되는 항목은 남아 있지 않다** — 아래는 전부 "필요해지면" 급이다.
> 착수 전에 §3(재조사 금지 목록)을 먼저 읽을 것.

**~~시간 포맷터 표기 통일~~ — 해소됨(`f8813da`).** 통일은 불가로 결론:
`useWorkoutSession.elapsedLabel`이 1초마다 갱신되는 라이브 타이머라 무패딩이면 `9:59→10:00`에서 폭이 바뀌어 레이아웃이 튄다.
대신 계약을 이름으로 드러냈다 — `formatClock`(시계·고정폭) / `formatHms`(기록·무패딩).
겸사겸사 배분 오류 1건(추격 격차가 화면마다 `03:00`/`3:00`으로 갈리던 것)을 무패딩으로 통일.

1. **JPQL 텍스트블록 통일** — §3 참조, 하려면 각 쿼리 내용을 신중히 옮겨적고 mvnw test로 즉시 검증 필요.
2. **KakaoAuthService 테스트 가능하게 리팩토링** — `HttpClient`를 생성자 주입으로 바꾸는 선행 작업 필요(사용자 승인 후 진행 권장).
4. **backdrop+fixed 패널 3종 BottomSheet 이관** — §3 참조, 시각 재설계 필요라 우선순위 낮음.
5. **`lib/api/hooks.ts` 도메인별 분리** — 파일 정리 수준, 실익 낮음(612줄, 판단 유지).
6. `Field/TextInput`을 라벨+힌트+에러까지 감싸는 `Field` 컴포넌트로 확장 — 콜사이트마다 라벨 위치·힌트 유무가 달라 지금은 leaf 프리미티브(TextInput/TextArea)만 추출함. 필요해지면 재검토.

### 오케스트레이터 작업 중 발견한 것 — 처리 완료

- ✅ **`createRoom` 활성 방 한도 TOCTOU** — 활성 조건이 `is_ended=false AND (end_at IS NULL OR end_at > now)`로
  **시간 의존이라 유니크 제약·부분 인덱스로는 막을 수 없다**(부분 인덱스는 `now()` 같은 비-immutable 함수를 못 쓴다).
  병렬 요청이 전부 한도 미달 상태를 읽고 통과해 한도가 사실상 무력화되는 스팸 벡터였다.
  → `AppUserRepository.findByIdForUpdate`(신규, `@Lock(PESSIMISTIC_WRITE)`)로 생성자 행을 잠그고 센다.
  같은 사용자의 동시 생성끼리만 대기하므로 정상 사용에는 경합이 없다. `ChallengeRepository.findByIdForUpdate` 선례를 따름.
- ✅ **`IndoorApprovalService` self-invocation — 비이슈로 확인.** `@Transactional` 기본 전파가 `REQUIRED`라
  내부 호출이든 프록시 경유든 결국 호출자 트랜잭션에 합류해 동작이 동일하다(양쪽 호출자 모두 `@Transactional`).
  다만 **여기를 `REQUIRES_NEW`로 바꾸면 내부 호출 경로만 조용히 무시**하므로 그 함정을 javadoc에 명시했다.
- ✅ **`CrewMatchService` nullable `startAt`/`endAt`** — 생성 경로는 `RaceRules.validateWindow`가 null을 막고 있어
  **활성 버그는 아니었고 방어 공백**이었다. 다만 컬럼은 스키마상 nullable이고 `derivedStatus`는 조회 경로라
  그런 행이 생기면 대항전 목록·상세가 통째로 500이 된다. 같은 파일의 `finalizeIfNeeded`·`memberDistances`는
  이미 가드가 있어 일관성도 깨져 있었다 → `derivedStatus`·`detectAndNotifyOvertake`에 가드 추가.

## 5. 백엔드 테스트 공백 — 처리 결과 (2차)

| 서비스 | 상태 | 비고 |
|---|---|---|
| NudgeService | ✅ 완료(`d4a1d86`, 20케이스) | 레이스/크루 넛지 양쪽 가드+일일한도(사전체크+유니크제약 경쟁조건)+variant+닉네임 null 대체 |
| ShoeService | ✅ 완료(`ae50284`, 27케이스) | 등록검증+첫신발/active자동활성화+activateShoe 동일신발 분기+목표거리 도달 이벤트 |
| ChallengeScheduler | ✅ 완료(`d930dfb`) | `nextOnrampWindow`는 기존에 이미 우수하게 커버돼 있었음(재확인만) — 실제로 비어있던 건 `sweepRaceLifecycle`/`ensureOpenPublicRace`(문서 기록대로), 이번에 추가 |
| ReengagementScheduler | ✅ 완료(`024d2e0`) | 3일/7일차+온보딩+주간한도+스트릭위험(daysSince!=1 방어)+격리 |
| CrewMatchScheduler | ✅ 완료(`0559dbd`) | ChallengeScheduler와 동일한 sweep 격리 패턴 |
| PushService | ✅ 완료(`aa487f5`) | `mockStatic(FirebaseApp/FirebaseMessaging)` + `mock(FirebaseMessagingException)`(final이지만 inline mock maker라 가능) — 이 프로젝트 최초의 정적 모킹 사례, 다음에 Firebase 관련 테스트 쓸 때 참고 |
| UserProvisioningService | ✅ 완료(`2127724`, 13케이스) | 계정 병합/생성 로직(Firebase 비의존이라 쉬웠음) |
| KakaoAuthService | ⛔ 보류 | §3/§4 참조 — HttpClient 생성자 주입 선행 필요 |

## 6. 수동 확인 필요 (자동검증 불가였던 것)

- **실기기(Android WebView) 백버튼**: ① 챌린지 상세 실내러닝 사진 뷰어(`f490812`) ② 신발 등록 브랜드 시트(`fe62a23`). 둘 다 로그인/실기기 필요라 브라우저 검증 못 함. (2차에서 추가로 변경된 SelectSheet/AsyncList/crewLoadState는 순수 코드이동이라 별도 수동확인 불필요 판단 — 다만 실제 화면은 여전히 미검증)

## 7. 3차 (2026-07-28) — 신규 코드 스캔 결과

조사 범위: 2차 이후 신규 코드 `2127724..HEAD`. 6개 렌즈(프론트 UI / 프론트 lib / 백엔드 / 프론트↔백 split-brain / 죽은 코드 / 구조·테스트공백) 병렬 스캔 + 후보별 적대적 재검증.

### 처리한 것

| 작업 | 내용 |
|---|---|
| **크루 '지난주 결산' 축 전체 삭제** | 커밋 `952d73f`가 `CrewHome.tsx` 61줄만 지우고 공급망을 남겨 ~200줄이 죽어 있었다. 프론트(`useCrewRecap`/`fetchCrewRecap`/`CrewRecap`·`CrewRecapLeader` 타입/`crew_recap_*` 6키×5로케일) + 백엔드(`GET /api/crews/me/recap`, `CrewService.recap`, 전용 헬퍼 `weekStartKst`, 네이티브 쿼리 `sumMemberDistanceBetween`, `CrewRecapResponse.java`) 전부 제거. **부활 시 백엔드 집계 로직 복구 비용이 크다는 점을 알고도 통째 삭제 선택(사용자 결정).** `sumMemberDistanceSince`는 크루 보드 + AchievementService가 계속 쓰므로 유지 |
| **`NsmSessionLogService` KST 단일 출처 복구** | 신규 파일이 `ZoneId.of("Asia/Seoul")`를 직접 선언해 `KstTime.ZONE`(커밋 `c297b75`가 세운 단일 출처)을 혼자 이탈해 있었다. 백엔드 전체에서 유일한 이탈이었음 |
| **시간 포맷터 로컬 사본 2벌 제거** | `PersonalBestsSection.formatDuration`, `WorkoutComparisonCard.fmtDuration` → `paceMath.formatHms`. 두 호출부 입력이 전부 정수임을 확인(백엔드가 `int`로 선언)해 **출력이 바이트 단위로 동일한 순수 이동** |
| **포맷터 2종 계약 명시** | 아래 §8-분열 참조 — 주석으로 상호 참조 + "새 사본 만들지 말 것" 경고 |

### ⚠️ 미해결로 남긴 것 — 시간 포맷터 표기 분열 (제품 결정 대기)

lib에 시간 포맷터가 **둘이고 1시간 미만에서 출력이 다르다**:
- `workoutTrack.formatDuration` — 분 0패딩 `"05:03"`, **10개 파일**이 사용(기록 목록·공유 카드·라이브 타이머 등)
- `paceMath.formatHms` — 분 무패딩 `"5:03"`, **4개 화면**이 사용(페이스 계산기·트레드밀·개인 최고 기록·비교 카드)

10분 미만 러닝/델타에서만 눈에 보이지만 같은 앱에서 같은 값이 두 표기로 나온다. **통일하면 한쪽 화면 표기가 바뀌므로 순수 리팩토링이 아니다(제품 결정 필요)** — 그래서 이번엔 양쪽 함수 javadoc에 서로를 링크하고 구분 기준·경고만 박아뒀다. 5번째 사본이 생기는 것은 이걸로 막힌다.

### 3차에서 검토 후 기각한 것 (재조사 금지 목록에 추가)

| 항목 | 이유 |
|---|---|
| `PaceCalculator.formatPointKm` ↔ `units.trimNum` 통합 | 같은 함수의 사본이 아니다. 겹치는 건 `Number(x.toFixed(1))` 한 줄 관용구뿐이고, 한쪽은 자릿수를 받는 범용 헬퍼·다른 쪽은 km 고정 표시 함수라 시그니처도 반환 형태도 다름. `formatGoalDistance` 재사용은 마일 변환 분기(units.ts:61)를 끌고 들어와 계약이 깨지고, 비공개 `trimNum`을 export로 여는 건 '이동'이 아니라 공개 API 확장. 호출부도 같은 파일 2곳뿐 |
| `KstTime`에 오늘/이번주/이번달 경계 헬퍼 추가 | `KstTime.java` javadoc이 이미 "도메인마다 다른 경계 계산은 여기서 합치지 않는다"고 명시적 반대 결정을 기록해뒀다. 게다가 위 결산 삭제로 `weekStartKst`가 사라져 주 시작 콜사이트가 3곳→2곳으로 줄었고, 오늘/이번달도 각 2곳×1~2줄이라 추출 가치가 사라짐 |
| `AdminDashboardController` CSV 파싱 통합 | 같은 파일 안 2곳×4줄, 절약 3줄. 단독 커밋 가치 없음(곁다리로 하면 무방) |
| 관리자 이름 리터럴(`@Value` 기본값 ↔ `EXCLUDED_DISPLAY_NAMES`) 통합 | 두 상수의 계약이 다르다 — 전자는 대시보드 접근 권한, 후자는 관리자 피드 제외 대상. 오늘 우연히 같은 사람 집합일 뿐이고 묶으면 "관리자를 추가하면 그 사람 러닝이 피드에서 사라진다"는 동작 변경이 된다. 제품 결정이지 리팩토링이 아님 |
| `CrewRacesSection` ↔ `ChallengePhaseBadge(compact)` 통합 | 클래스 문자열·톤·i18n 키까지 동일해 후보였으나, 통합하면 마크업 구조가 바뀌어 순수 이동이 아니라는 검증 결과 |
| `lib/api/hooks.ts` 도메인별 분리 | 595→622줄로 자랐지만 2차 판단(파일 정리일 뿐, 실질 중복 제거 아님) 그대로 유효 |

## 8. 검증 게이트

- 프론트: `npx tsc --noEmit` + `npx eslint` + `npm run build` + `npm run test`(vitest 267, 23파일 — 테스트는 `frontend/tests/lib/`에 모듈 1:1 배치, 5차에서 정돈)
- 백엔드: `./mvnw.cmd -q -o test` (447)
- 리팩토링 원칙: 한 커밋=한 추출, 추출은 이동이지 개선이 아님(다듬고 싶으면 별도 커밋), 동작 변경은 커밋 메시지에 ⚠️ 명시.


## 9. 4차 (2026-08-12) — 죽은 코드 정리

조사 범위: `f87c08d..HEAD`. §3(재조사 금지 목록)을 먼저 적용해 이미 기각된 항목은 건너뛰었다.
**구조적으로 손볼 것은 없었다** — 큰 파일들(`useWorkoutSession` 962줄, `CrewService` 891줄)은 3차까지의
판단(분해 실익 낮음)이 그대로 유효하고, 신규 모듈들은 각자 단일 관심사다. 나온 것은 전부 죽은 코드였다.

### 처리한 것

| 작업 | 내용 |
|---|---|
| `/me/language` 프론트 래퍼 제거 | `LanguageSync`가 `updatePreferences`(언어+타임존 동시 전송)로 갈아타며 고아가 됨. **백엔드 엔드포인트는 남겼다** — `updatePreferences`가 같은 날 들어와 배포된 구버전 앱이 아직 `/me/language`를 호출한다. `@Deprecated` + 제거 조건을 javadoc에 명시 |
| 미사용 i18n 키 24종 × 5로케일 = 120개 제거 | 동적 키 접근(템플릿 리터럴로 `t[...]` 인덱싱)이 코드베이스에 없음을 확인해 오탐 위험 없음. 제거 후 5개 로케일 모두 947개로 균일 |
| 미사용 export 5개 제거 | `shortMonthDay`·`addDaysIso`(크루 결산 삭제 잔재), `invalidateRivals`·`invalidateShoes`(각 화면이 훅 바인딩 `mutate`를 직접 써서 대체됨 — 누락이 아니라 상위 호환), `updateWorkoutShoe` |
| `workoutWallClock` → `workoutStartedAtForDisplay` 위임 | 같은 `startedAtLocal ?? startedAt` 폴백이 두 벌이던 것 통합 |
| 언어별 페이지 16개 축소 | 래퍼 컴포넌트 + 3줄 주석 16벌 → `export { default } from ...` 재export. 주석의 근거(왜 `[locale]` 동적 세그먼트를 안 쓰는지)는 `seo.ts` 한 곳으로 이동. 파일당 11줄 → 5줄 |

### 4차에서 검토 후 기각·보류한 것 (재조사 금지 목록에 추가)

| 항목 | 이유 |
|---|---|
| `AuthController` `PATCH /me/language` 엔드포인트 제거 | 위 참조 — 대체재가 하루 전에 들어와 배포된 구버전 앱이 전부 이 경로를 쓴다. `LanguageSync`가 에러를 삼키므로 제거하면 구버전 사용자의 언어 동기화가 **조용히** 멈춘다. 구버전 사용률이 떨어진 뒤 제거할 것 |
| `WorkoutDetail.shoeId`/`shoeName` 타입 필드 | UI에서 안 쓰지만 백엔드 응답 필드를 그대로 반영한 타입이라 문서 역할을 한다. 제거 이득 없음 |
| `useWorkoutSession.ts`(962줄) 분해 | 3차까지의 판단 유지. 상태·레프가 GPS 콜백 하나를 중심으로 강하게 얽혀 있어 분리하면 props/ref 전달만 늘어난다 |

### 리팩토링은 아니지만 발견한 것 (제품 판단 필요)

- **`user_activity_history`가 쓰기 전용이다.** `ActivityHistoryService.record`/`recordSelf`를 여러 서비스가
  호출하지만 `UserActivityHistoryRepository`에 조회 메서드가 없고 컨트롤러도 없다. 테이블은 계속
  쌓이는데 읽는 경로가 전혀 없고 보존 정책도 없다 — 관리자 화면이 미완인지, 의도된 중간 상태인지 확인 필요.
- **`PATCH /api/workouts/{id}/shoe`에 UI가 없다.** 프론트 래퍼(`updateWorkoutShoe`)를 이번에 제거했는데
  애초에 호출부가 없었다. 신발 귀속은 저장 시 서버가 자동으로 하고(`attributeActiveShoe`), 수동 변경
  수단은 백엔드에만 있다.


## 10. 5차 (2026-08-13) — 전체 재스캔

1~4차가 증분 범위였던 것과 달리 코드베이스 전체를 다시 스캔했다(6렌즈 병렬: 프론트 UI / 프론트 lib / 백엔드 /
죽은 코드 / 프론트↔백 계약 정합 / 구조·테스트 공백). §3 재조사 금지 목록을 먼저 적용했고,
아래 "검토 후 기각"에 5차의 기각 사유를 추가했다. 전체 diff 순감 ~120줄(프론트) + 백엔드 중복 22곳 흡수.

### 처리한 것 — 백엔드

| 작업 | 내용 |
|---|---|
| 리포지토리 `getRequired` 관용구 확산 | AppUserRepository 선례(default 메서드로 404 변환 흡수)를 Challenge(`getRequired`/`getRequiredForUpdate`)·Crew·Shoe·WorkoutSession(`getRequiredForUser`) 리포지토리로 확장. `findBy...().orElseThrow(notFound)` 복붙 19곳 제거, 테스트 스텁 ~51곳도 관용구로 갱신 |
| `ChallengeWorkoutRepository` 중복 메서드 제거 | `findAllByChallengeIdAndApprovalStatusOrderByStartedDesc`와 `...ApprovalStatus`가 구현까지 동일했음 — 짧은 이름만 남기고 정렬 계약은 javadoc으로 명시 |
| `CrewMatchService.sumByCrew` | 도전자/상대 합산 루프 4벌(buildRosterBoard·crewSums·finalizeEnded·toSummary)을 단일 출처로 통합. 승패 판정과 화면 합계가 어긋날 수 없게 됨. toSummary는 관점 뒤집기 2줄(같은 파일 detectAndNotifyOvertake 선례) |
| `ChallengeController.toListPage` | 목록 3엔드포인트(공개/mine/크루)의 "clamp→배치조회 3종→DTO 매핑" 10줄 조립 중복을 통합. memberIds 도출만 람다로 주입 |
| `SchedulerGuard.runIsolated` | 스케줄러 건별 격리 try/catch+errorLog 4벌(Challenge×2·CrewMatch·Reengagement) 통합. 로그 출력은 바이트 보존, ReengagementScheduler.forEachSafely는 위임으로 축소 |
| `NotificationLinks` | `challengeLink`(private였음)·`matchLink`를 패키지 공용으로 승격 — WorkoutNotifications의 `"/challenges/" + id` 리터럴 2곳이 이탈해 있었음 |
| `ChallengeMemberRepositoryCustom.headToHeadRecord` | 승패 집계 루프(동순위=무집계)가 ChallengeService·RivalService에 byte-identical 2벌 → 리포지토리 default 메서드로 |
| `ChallengeService.MAX_MEMBERS_LIMIT` 공유 | ChallengeScheduler의 `OPEN_RACE_MAX_MEMBERS = 50` 복사본이 주석으로만 커플링을 선언 — package-private으로 열어 참조로 교체(어긋나면 온램프 자동 보충이 매일 400으로 실패하는 구조였음) |
| `ChallengeRepositoryImpl.orderBy` 병합 | `orderBy`/`crewOrderBy`가 ended 분기 완전 동일 + 정렬 방향만 반대 → `recentFirst` 플래그 |
| `AppUser.WITHDRAWN_NICKNAME` | "탈퇴한 러너" 리터럴 2곳(엔티티+projection 쿼리) 상수화 |
| ⚠️ 크루 컨트롤러 `PathPatterns.ID` 제약 | Crew/CrewMatch 컨트롤러만 숫자 경로변수 정규식 누락(13곳) — 인증 필터·타 도메인 전부와 비대칭이었고, `/api/crews/abc` 같은 요청이 핸들러까지 와서 타입 변환 실패 500 + error_log 오염. 타 도메인과 동일하게 제약 추가(**비숫자 경로 500→404**) |
| ⚠️ `ForbiddenTextChars` `\p{Cntrl}`→`\p{Cc}` | 프론트(`\p{Cc}`, C1 포함)와 백엔드(POSIX, ASCII 한정)가 어긋나 C1 제어문자(U+0080~9F)가 백엔드를 통과했음. 주석이 "양쪽 함께 수정" 계약을 명시한 지점의 순수 드리프트 — 백엔드를 맞추고(**검증 강화**) `ForbiddenTextCharsTest` 신설(공용 유틸 최초 테스트) |
| `DELETE /api/workouts/{id}` `@Deprecated` | 프론트는 POST `/{id}/delete`만 사용(정적 export에서 DELETE 차단 우회). 구버전 잔존 가능성 때문에 유지하되 `/me/language` 선례대로 제거 조건 문서화 |
| 죽은 코드 | `AppUser.isWithdrawn()`(호출 0 — 탈퇴 판정은 전부 리포지토리 파생쿼리), `WorkoutService`의 미사용 `ZoneId` import |

### 처리한 것 — 프론트

| 작업 | 내용 |
|---|---|
| 죽은 코드 삭제 | `crew/_components/StatTile.tsx`(고아 파일), `parseWorkoutId`·`parseNsmReportId`(각 `*FromPath`가 실사용), i18n `crew_goal_reached`+`ach_week_count`+`ach_first_run_of_week` ×5로케일(뒤 2개는 백엔드가 발행 않는 성과코드의 잔재 — 회귀 가드 테스트로 확인), `public/` create-next-app 기본 svg 5개 |
| `useAppUrlOpen` 훅 | DeepLinkBootstrap ↔ KakaoOAuthBootstrap이 컴포넌트 통째 복제(runWhenNavReady는 바이트 동일)였음 — `runWhenNavReady`는 `nativeNav.ts`로, appUrlOpen 리스너+launch 1회 가드는 훅으로. 두 컴포넌트는 3줄로 축소 |
| `lib/crewMatch.ts` | `daysLeft`·`matchSharePercent`(0/0→50 규칙 포함) 2벌 통합 |
| `paceMath.ts` 추가분 | `pbFinishSec`(pbTimeSec/pbTotalSec 2벌), `avgPaceSecPerKm`(10m 게이트, workoutStats↔useWorkoutSession 2벌) |
| `format.ts` 추가분 | `daysInMonth`(named 2벌+인라인 1), `ymd`(3벌), `deltaPercent`(5벌) |
| `deepLink.ts` `buildAppIntentUrl` | Android intent:// 조립+패키지명 하드코딩 2벌 통합 (authLogin의 크롬 인텐트는 다른 계약이라 대상 아님) |
| ⚠️ `formatRaceTime` 사본 제거 | NsmBlockReportContent의 로컬 사본(표시 전용)을 `formatHms`로 — **1시간 이상 재측정 기록 "225:00"→"3:45:00" 정상화**. training/page.tsx의 동일 본문 사본은 입력칸 왕복(parseTime `m:ss`) 전용이라 유지가 정답 — 대체 금지 주석 박음. 두 사본 모두 `Math.round(sec % 60)`이라 비정수 입력 시 `"4:60"` 함정이 있었음(현재 입력은 전부 정수라 잠복) |
| ⚠️ `safeStorage.localText` | Safari 프라이빗 모드에서 `setItem` throw로 단위 변경(UnitContext)·언어 변경(LocaleContext)·온보딩 닫기(WelcomeOnboarding)가 죽는 경로 — 가드된 문자열 API 신설 후 3파일만 이관(예외 시 조용히 무시). 나머지 원시 storage 접근 ~10곳은 후보로 남김 |
| `COLD_CONFIG` | hooks.ts의 `{...BASE_CONFIG, revalidateOnFocus:false}` 5벌 상수화. **부수 발견: BASE_CONFIG가 이미 revalidateOnFocus:false라 5곳 전부 no-op 오버라이드였음** — 값이 계약임을 주석으로 고정 |
| `Card` p-4 + 로그인 카드 | Card padding 유니온이 p-5/p-6뿐이라 p-4가 필요한 14곳이 전부 로컬 div로 이탈해 있었음 — 토큰 추가 후 11곳+로그인/카카오 3곳 흡수(`<section>` 3곳·`<Link>` 1곳은 시맨틱 달라 제외) |
| `ui/SheetHeader` | 바텀시트 헤더(제목+✕) 4벌 통합(PrizeEditorModal/ShoeFormSheet=bordered, RejectModal/CrewDetailContent=비bordered). SelectSheet는 SVG 글리프라 제외 |
| `pageLoading()` | `<PageLayout title><LoadingCard/></PageLayout>` 인증 게이트 셸 12곳 통합(crewLoadState 선례의 일반 함수 스타일) |
| `ShareIcon`+`ACTION_ICON_CLASS` | 챌린지/운동 상세 2파일에 바이트 동일 복붙 → 공용 파일 |
| `useCollapsibleList` | 접기/펼치기 목록 상태 4벌(변수명 외 라인 동일) 통합 — 기각된 useAsyncAction("모양 제각각")과 달리 동작 차이 0 |
| hooks.ts:106 주석 정정 | "isOwner 때문에 uid를 키에 포함" → 실근거는 isMember/showManage (isOwner는 프론트 미사용, 아래 계약 절 참조) |
| 테스트 배치 정돈 | `tests/nsm.test.ts`→`tests/lib/`, 루트 `workoutTrack.test.ts` 6케이스는 lib 파일에 미포섭 확인 후 이동·병합(케이스 손실 0, 23파일/267개) |

### 5차에서 검토 후 기각한 것 (재조사 금지 목록에 추가)

| 항목 | 이유 |
|---|---|
| `isStoredUrl`+`invalid_image_url` 가드 3곳 통합 | 정규화 계약이 미묘하게 다름 — CrewService는 `trim()`+반환, WorkoutService.updateImage는 `strip()`+반환, validateIndoorInput은 무정규화 검사만. 통합하면 저장값이 바뀌는 곳이 생겨 순수 이동 아님 |
| JSON 직렬화 실패 예외 두 갈래(IllegalStateException vs `ApiException.internal`) | 방향 결정이 필요한 설계 판단 — internal로 모으면 error_log에서 스택이 사라지고(recordApiError가 stack null), IllegalStateException으로 모으면 응답 코드가 internal_error로 뭉개짐. cause를 받는 오버로드 신설이 선행돼야 함 |
| NudgeService 진입 가드·WorkoutService 멱등 판별 골격 복붙 | 각 2곳·10줄 미만, 추출 이득이 churn보다 작음 |
| `ShoeService.requireText`/`FeedbackService.requiredText` → `requireCleanText` 채택 | blank→throw라 기존 기각 사유(blank→null)는 비적용이지만, 채택 시 금지문자 검사가 새로 추가돼 입력 거부 범위가 넓어짐 — 순수 이동 아님. 별개로 `ShoeService.optionalText`만 길이 초과를 조용히 절삭(나머지 5개 헬퍼는 전부 400) — 버그성 불일치로 후보에 기록 |
| 업로드 엔드포인트 검증 비대칭(`/feedback-image`만 5MB+타입 검사) | 검증 확대는 동작 변경(기존 업로드 거부 가능) — 제품 판단. `file_empty` 3줄 통합만 순수지만 단독 가치 없음 |
| InlineError(`text-xs text-red-600` 10곳) 컴포넌트화 | 여백 3종 + `text-red-500` 3곳이 섞여 있어 전면 통합은 시각 변화. 필요해지면 red-600 계열만 |
| RejectModal ↔ ApplyModal `MessageInputSheet` 통합 | 2곳뿐 + label 유무·여백 차이. SheetHeader 추출로 이미 절반이 공용화됨 |
| DatePickerSheet ↔ DateTimePickerSheet 드럼 시트 껍데기 통합 | 좌측 버튼 계약(지우기 vs 취소)·z-index가 달라 prop 설계 필요 — `daysInMonth`/`ymd` 공유로 실질 중복은 이미 제거 |
| crew 로스터 선택 블록 2벌(challenge↔match) 통합 | challenge 쪽 `justify-between gap-3`이 시각적으로 무효라는 분석이 맞아도 마크업 구조 변경이라 순수 이동 아님 — 보류 |
| `useUserResource` 훅(hooks.ts 내 uid 키 훅 12벌) | 가독성 트레이드오프 판단 필요(훅 시그니처가 간접화됨). COLD_CONFIG만 우선 적용 |
| `flattenPages` 무한스크롤 소비측 헬퍼 | `hasNext`/`hasMore` 필드명 분열(백엔드 3 DTO)이 원인 — 백엔드 응답 통일이 선행돼야 깔끔, 프론트 어댑터만 만들면 어중간 |
| DTO 8개 컨트롤러 중첩 → `dto/` 이동, `*Dto` 접미사 4개, `share/`·`upload/` 하위 패키지 | 파일 정리 수준(hooks.ts 도메인 분리 기각과 같은 잣대). `AdminDashboardController.MemberRow` ↔ `challenge/dto/MemberRow` 단순명 충돌만 주의 |
| `pageStateStore.persistEnabled` = `nativeNav.isNativeApp` 2벌 | 순환 import 때문에 leaf 모듈 신설 필요 — 2줄 함수에 과한 구조 |
| `@capacitor/ios` 의존성 제거 | iOS 로드맵 의존 — 사용자 결정 |
| 테스트만 쓰는 export 4개(kmFromInput·pathDistanceMeters·thresholdFromRace·isChallengeListCacheKey) 제거 | 순수 유틸 회귀 테스트 가치로 유지 |
| `WorkoutComparisonItem`이 `repository/` 패키지에 있는 것 | QueryDSL 프로젝션을 리포지토리 곁에 두는 선택으로 볼 수 있고 유일 사례 — 이동 실익 낮음 |

### 계약 정합 스캔 발견 — 제품 판단 대기 (리팩토링 아님)

- ~~**실내런 저장 응답의 성과(achievements)가 프론트에서 통째로 버려진다.**~~ **→ 해소됨(§11).**
  `createIndoorRun` 반환 타입을 `CreateWorkoutResponse`로 바꾸고 실내런에도 축하 모달을 붙였다.
  동시에 축하 모달 전체를 "보여줄 카드가 있을 때만" 띄우도록 재설계했다.
- **레이스 축 에러코드 매핑 공백.** `room_full`·`already_member`·`already_started`·`ended`·
  `owner_cannot_leave`·투표 계열(`already_voted` 등)이 매핑 없이 `ApiError: API 409: {"error":...}` raw
  문자열로 노출된다(동시성으로 실제 도달 가능). 크루 축은 같은 계열을 6개씩 매핑해 둔 것과 대비.
- **탈퇴 닉네임 null 계약 분열.** 레이스 축 3곳은 서버가 "탈퇴한 러너"(한국어 하드코딩)를 굽고,
  크루 축 3곳은 null을 보내 프론트 `t.no_name`(5로케일)이 처리한다. 비한국어 사용자에게 한국어가
  노출되는 쪽이 문제 — null 통일(프론트 i18n 위임)을 권장하나 응답 변경이라 제품 판단.
- **미사용 응답 필드**(프론트 grep 0): `isOwner`·`creatorUserId`·`canDecline`(canAccept과 동일식)·
  `latestBlockRetestId`(프론트가 재유도)·`remainingKm`·`achievedAt`·`applicantUserId`·`startSource*`·
  `appliedDistanceM`(현재 항상 distanceM과 동일)·`PathPointDto.ele`(프론트가 안 보내 dormant).
  4차의 WorkoutDetail.shoeId 잣대(응답 문서 역할로 유지)를 적용하되, **`CrewDetailResponse.myApplicationStatus`만은
  상세 조회마다 추가 쿼리를 낭비**(프론트는 별도 API로 재계산) — 제거 권장, 응답 계약 변경이라 보류.
- **fitness 모듈 전체가 도달 불가.** 컨트롤러는 의도적 404(치팅 차단, 재개 조건 javadoc 완비)지만
  `FitnessService`(90줄)·`UpsertDailyDistanceResponse`는 주입처 0. 재개 시 어차피 재작업이 명시돼 있어
  삭제해도 무방하나 3차 결산 삭제처럼 사용자 결정 사안. `DailyDistanceRepository`는 탈퇴 정리가 쓰므로 유지 필수.
- **백엔드 테스트 공백(가치순)**: `FirebaseAuthFilter`(248줄/분기24 — 무테스트 최대), `PrizeResultService`
  (경품 당첨 판정), `ApiExceptionHandler`, `common/` 순수 유틸(`RaceRules`·`TextValidation`·`PageParams` —
  5차에서 `ForbiddenTextChars`만 채움), 알림 리스너 5/6. 프론트는 `errorMap.ts`(fallback 지연평가 계약)·
  `challengePhase.ts`만 공백. KakaoAuthService 보류 유지(§3).
- **로그인 팝업 판정 불일치**: `login/page.tsx`는 정규식으로 `closed`도 차단 취급, `authLogin.isPopupBlockedError`는
  `popup-closed-by-user`를 명시적으로 제외 — 정반대 판정. 의도 확인 필요.
- **시크릿·스크립트 위생**(배포는 사용자 직접 관리 영역이라 보고만): `application-local.yml`에 실 AWS 키·JWT
  시크릿·카카오 키 평문(.gitignore로 미추적임은 확인), `infra/ec2-ensure-firebase-init.sh`는 참조 0 고아 +
  Firebase 설정 하드코딩 폴백, `scripts/deploy*.mjs`에 PEM 절대경로·EC2 IP 하드코딩, README가
  `frontend:deploy`/`backend:deploy` 스크립트(로컬 테스트 게이트 내장)를 언급하지 않아 문서 경로가 자동화보다 약함,
  `scripts/generate_playstore_mockups.py`는 입력 폴더가 사라진 재현 불가 스크립트(삭제 후보).

## 11. 운동 완료 축하 모달 재설계 (2026-08-13)

§10의 "실내런 성과 축 단절"을 고치려다 축하 화면 전체를 다시 짰다. 리팩토링이 아니라 제품 변경이지만,
발단이 5차 계약 스캔이고 죽은 코드 정리를 겸했으므로 여기 남긴다.

### 왜 바꿨나

백엔드 `AchievementService`는 **"내세울 게 없으면 빈 목록을 반환한다 — 억지 폴백을 두면 성과가 값싸진다"**를
클래스 javadoc에 명시하고 지킨다. 그런데 UI는 그 판정과 무관하게 **매번** confetti + 🎉 + 통계 3칸을 띄웠다.
백엔드가 거부한 억지 폴백을 화면에서 하고 있었던 셈이다. 게다가 실내런은 모달 자체가 없어
같은 첫 러닝이라도 GPS면 축하가 뜨고 실내면 무음이었다.

### 설계

| 상황 | 모달 | confetti·🎉·축하문구 |
|---|---|---|
| 성과(achievements) 또는 개인최고기록(PB) | O | O |
| 고스트 승리 | O | O |
| 고스트 무승부·패배 | O (결과 + 훈련 제안만) | X |
| 아무것도 없음 | X — 상세로 바로 이동 | — |

- 통계 3칸(시간·거리·페이스) 제거 — 확인/자동이동으로 2초 뒤 가는 상세 화면이 같은 값을 더 자세히 준다.
- `lib/celebration.ts` `celebrationTone()` 신설 — **GPS·실내런이 이 순수 함수 하나를 공유**한다(테스트 9케이스).

### 리뷰에서 잡혀 설계가 바뀐 것 (코덱스 교차 검토)

- **고스트 패배를 모달에서 빼면 안 된다.** NSM 훈련 제안 CTA가 고스트 카드 *안에* 있어서, 패배를 제외하면
  그 기능과 7일 캡·`nsm_cta_shown` 지표가 통째로 사라진다. → 패배도 모달은 띄우되 연출만 뺀다.
- **게이트는 `achievements.length`가 아니라 변환 성공한 카드 수여야 한다.** `achievementView()`는 모르는
  코드를 null로 버리므로(서버 선배포 방어), 통계를 없앤 뒤엔 그게 "제목만 있고 내용 없는 모달"이 된다.
  → `achievementViews()` 헬퍼를 만들어 게이트와 렌더가 같은 결과를 쓴다.
- **고스트는 `ghostResult`와 `ghostLabel`이 둘 다 있어야** 카드가 렌더된다 — 하나만 보고 열면 빈 모달.
- **게이트 거짓일 때 명시적으로 이동해야 한다.** 상세 이동을 모달의 확인 버튼·타이머가 전담하고 있어서,
  `setCelebration`만 건너뛰면 사용자가 종료된 운동 화면에 갇힌다.
- 축하 판정의 반올림을 카드 표시와 일치시켰다(`deltaSec > 0`) — 0.5초 앞선 런이 카드엔 "무승부"인데
  confetti가 터지는 모순 방지.
- (2차 리뷰) `ghostLabel`을 게이트는 `!= null`, 카드는 truthy로 보고 있어 **빈 문자열이면 빈 모달**이 됐다.
  정상 생성 경로는 `formatDistance()`라 비지 않지만 재시도용 로컬 보관 데이터는 검증 없이 읽힌다 → 양쪽 truthy로 통일.
- (2차 리뷰) 이 모달만 `role="dialog"`·`aria-modal`(다른 모달 3곳 보유)과 `useNativeBack`(9곳 보유)을
  안 쓰고 있었다 → 관례에 맞춤. 백버튼은 확인과 같게(상세로 이동) 처리하고, 축하가 아닐 땐 제목 요소가
  없으므로 고스트 카드 제목을 `aria-label`로 준다.
- (3차 리뷰) `nsmCtaVisible`에도 같은 불일치가 남아 있었다 — `ghostLabel=""`이고 PB·성과로 모달이 열리면
  **CTA는 안 보이는데 7일 캡(`markNsmCtaShown`)과 `nsm_cta_shown` 지표만 소비**됐다 → truthy로 통일.

> **교훈: `ghostLabel`의 `!= null` vs truthy 불일치가 서로 다른 3곳에서 나왔고 리뷰 3라운드를 거쳐서야
> 다 잡혔다.** "카드가 렌더되는가"를 묻는 지점(게이트·CTA 캡·aria 이름·카드 자체)은 판정을 반드시
> 같은 식으로 써야 한다. 다음에 이 파일을 만질 때 조건을 하나 추가한다면 나머지 전부와 대조할 것.

### 겸사겸사 정리한 죽은 코드

- `saving` prop + `celebration_saving` ×5로케일: 모달은 **저장 성공 후에만** 세팅되고 그 시점엔 `saving`이
  이미 false라(React 19 배칭) 도달 불가 분기였다.
- `onConfirm`: GPS 호출부가 no-op을 넘기고 있었다 → 제거, 모달이 이동만 담당.
- `CelebrationState.snapshot`: 통계 표시 전용이라 함께 제거.
- 프론트 주석 `"규칙상 최소 하나는 온다"` → 백엔드와 모순되는 거짓이라 정정.

### 함께 고친 문구 (오해 방지)

크루 성과 2종에 "이번 달"을 명시했다(5로케일). 승인 대기 중인 실내런 직후 "크루 목표 달성"이 뜨면
**레이스에 반영된 것으로 오해**할 수 있는데, 크루 월간 목표·순위는 승인과 무관한 일반 누적 기준이라
별개 개념이다. (`ach_crew_goal_reached`는 이미 "이번 달"이 있어 그대로 뒀다.)

### 예상 노출 빈도

`WEEK_DISTANCE`(이번 주 최장) 규칙 덕에 **매주 첫 러닝은 사실상 항상 배너를 받는다**.
주 1회 러너는 거의 매번, 주 3회 동일거리는 약 1/3, 주 5회 동일거리는 약 1/5로 추정(코덱스와 독립 추정 일치).
활동량이 많을수록 줄어드는데 그게 희소성의 의도다.

### 수동 확인 필요

축하 모달은 로그인 + 실제 운동 저장을 거쳐야 도달해서 브라우저 프리뷰로 검증 불가.
실기기에서 ① GPS 런 저장 시 성과 없으면 상세로 직행하는지 ② 성과 있으면 confetti가 뜨는지
③ 고스트 패배 시 confetti 없이 훈련 제안이 보이는지 ④ 실내런 첫 러닝에 축하가 뜨는지 확인할 것.

## 12. 6차 (2026-08-21) — 감사 + 안드로이드 실행 크래시

증분 조사(`0790f89..HEAD`)와 별개로 안드로이드 "실행 3초 후 종료" 원인 분석이 함께 돌았다.
커밋: `4e19ac4`(아이콘 보호) → `bc69924`(R8 경로 복구) → `5ffe97e`(감사 결함) →
`682e6cd`(방치 판정) → `61c65ff`(감사 4·5·6 완결).
코덱스 교차 검토를 세 번 돌렸다 — 감사 1회, 수정 검증 1회, 크래시 진단에 적대적 4라운드 1회.

### 안드로이드 실행 크래시 — 실증으로 확정한 것

**리소스 축소기는 `getIdentifier` 기반 참조를 절반만 살린다.** 실제 빌드로 확인:

- `strings.xml`의 `capacitor_background_geolocation_notification_icon = "drawable/ic_tracking"`은
  DEX 문자열 풀 휴리스틱으로 **살아남고**(`reachable=true`), 그 문자열이 가리키는 드로어블만
  **죽는다**(`reachable=false`). 둘 다 죽었다면 플러그인이 폴백 `mipmap/ic_launcher`를 써서
  문제가 없었을 것이다 — 휴리스틱이 절반만 작동해서 생긴 버그다.
- proto 중간 산출물(`shrunk-resources-proto-format-release.ap_`)에는 **값이 0개인 껍데기 엔트리**가
  남아 있어 "ID가 살아있다"고 오인하기 쉽다. `aapt2 convert --output-format binary`(= Play가 AAB에서
  기기용 APK를 만들 때 bundletool이 도는 것)를 거치면 엔트리가 완전히 사라진다.
  **중간 산출물이 아니라 바이너리 테이블로 판단할 것.**
- ⇒ `getIdentifier() == 0` → `setSmallIcon(0)` → 아이콘 없는 알림으로 `startForeground` →
  시스템이 비동기 `BadForegroundServiceNotificationException`으로 프로세스 종료(호출부 try/catch로 못 잡음).

**`res/raw/keep.xml`으로 막았고, 효과도 실증했다**(`reachable=false` → `true`, 최종 바이너리에 파일 존재).
다만 `9a7b646`이 R8을 끄면서 `-dontwarn com.facebook.*` 5줄을 함께 지워, **R8을 다시 켜면 빌드부터
실패**하는 상태였다(프로브에서 재현) → `bc69924`에서 복원. keep.xml은 그때까지 사문이었다.

**R8은 여전히 꺼져 있다.** 켤 수 있는 상태만 복구했다. 크래시 원인이 확정되지 않았으므로
재활성화 전에 Play Console → Android vitals에서 versionCode 8의 크래시 클러스터를 확인할 것.

**진단에서 틀렸던 것(기록용)**: "저장 세션 복원 직후 자동으로 워처가 붙는다"는 서술은 거짓이었다.
`useWorkoutSession`의 재개 이펙트가 의존성 `[startWatch]` 하나뿐인데 그 체인이 전부 상수라
마운트 시 1회만 돌고, 콜드스타트에서는 인증 해소가 항상 그 뒤라 재실행되지 않았다
(`61c65ff` 이전 `5ffe97e`에서 복원 지점 직접 호출로 교체). 실제 트리거는 권한 다이얼로그가
닫히며 발생하는 `appStateChange`다 — `POST_NOTIFICATIONS`가 1.0.6에서 처음 추가돼
업그레이드 첫 실행에 다이얼로그가 반드시 뜬다.

### 처리한 것 — 백엔드

| 작업 | 내용 |
|---|---|
| ⚠️ 탈퇴 사용자 이력 소멸 | 관리자 조회가 `display_name not in (...)`이었는데 탈퇴 익명화가 `display_name`을 null로 만든다. SQL 삼값 논리로 `NULL NOT IN (...)`은 true가 아니라 NULL이라 그 행이 통째로 빠졌다 — **`ACCOUNT_WITHDRAWN`은 익명화 직전에 기록되므로 100% 누락**됐고 과거 활동·운동도 소급 소멸했다. 활동·운동 두 쿼리 모두 `is null or not in`으로 수정 |
| 활동 이력 보존 정책 | 삭제 경로가 없어 무한히 자라던 테이블에 `ActivityHistoryRetentionScheduler`(일 1회 UTC 고정, 기본 365일, `runrace.history.retention-days` 0 이하면 비활성). 1000건×최대 50배치로 끊어 긴 락 회피 |
| V69 인덱스 | V67의 인덱스 4개는 선두 컬럼이 actor/subject/target/action이라 관리자 조회의 전역 `order by occurred_at desc`를 못 받쳤다. `(occurred_at desc)` 추가 |
| `WORKOUT_STARTED` targetType | `WORKOUT`인데 사용자 UUID를 넣어 `(target_type, target_id, occurred_at)` 인덱스를 무의미하게 만들고 있었다 → `USER`로 정정 |
| `recordSelfOnce` | 대상 엔티티가 없어 멱등 키를 못 만드는 `/workouts/start`용 시간 창 중복 억제(1분). `(actor_user_id, occurred_at desc)` 인덱스가 그대로 받쳐준다 |
| 중복 상수 통합 | `ACTIVITY_EXCLUDED_DISPLAY_NAMES`가 바로 위 `EXCLUDED_DISPLAY_NAMES`와 바이트 동일 |

### 처리한 것 — 프론트

| 작업 | 내용 |
|---|---|
| ⚠️ 추천 레이스 생성 불가 | 템플릿이 시작 시각을 선택 순간의 분으로 채우는데 검증은 현재 분 이후만 허용 — 제목 고치는 사이 분이 넘어가면 거부됐다(평균 절반). **현재 분으로 당기는 것으로는 부족**하다: `12:34:59`에 보낸 `12:34`가 서버에 `12:35:00`에 닿으면 `RaceRules`가 다시 거부한다(코덱스 재검토 지적). 지나거나 현재인 값은 전부 **다음 분으로** 민다. 23:59에 `startAt == endAt`이 되던 퇴화 구간은 다음 마감으로 롤오버 |
| ⚠️ 방치 판정 우회 | 포그라운드 복귀 시 앵커를 무조건 리셋해, 30분+ 쉬었다 돌아오면 자동 일시정지를 통째로 건너뛰고 쉰 시간이 운동 시간·페이스에 섞였다. §12 "가르지 못하는 것" 참조 |
| ⚠️ i18n을 안 거치던 경로 | GPS 오류 5종이 `workoutTrack`에서 한국어 문장을 그대로 반환(어떤 언어를 써도 한국어 배너), API 계층 서버·네트워크·인증 문구도 하드코딩. 전자는 코드 반환 + 화면 계층 매핑, 후자는 `api/errorTexts.ts` 싱글턴에 로케일 프로바이더가 등록. 레이스 축 에러코드 6종은 매핑이 없어 `ApiError: API 409: {...}` 원문이 노출됐다 |
| 자동 재개 미발화 | `pendingResumeWatchRef` + 별도 이펙트 구조가 의존성 상수화로 마운트 1회만 돌았다 → 복원 지점에서 직접 호출 |
| 다중 탭 스냅샷 | 키 하나를 모든 탭이 공유해 10초마다 서로 밀어냈다 → 먼저 자리 잡은 런이 살아있는 동안(60초) 보호. `clearWorkout(runStartedAt)`으로 종료 시 남의 스냅샷 삭제도 차단 |
| 만료 정리 시점 | 24시간 검사가 복원 경로 안에서만 돌아 로그아웃·타계정에서는 정밀 GPS 경로가 계속 남았다 → `purgeExpiredWorkout()`을 인증 무관하게 앱 시작 시 |
| `allowBackup=false` | WebView localStorage의 GPS 경로가 구글 백업으로 올라가 타 기기에서 복원되던 경로 차단 |
| 죽은 코드·위생 | `ui/RankingCard.tsx`(참조 0), `/sb`(관리자 대시보드) robots 차단, 삭제 확인 2곳 `cancelLabel` 누락, `ConfirmProvider` 기본 문구 언어 중립화, 로그인 팝업 판정이 두 경로에서 정반대이던 것 통일(직접 닫은 건 오류 아님 → 배너 없음) |

### 6차에서 검토 후 남기기로 한 것 (재조사 금지 목록에 추가)

| 항목 | 이유 |
|---|---|
| **관리자 대시보드 `displayName` 인증** | `ensureAdmin`이 UID 외에 `displayName`이 `runrace.admin.display-names`와 같아도 통과시킨다. `displayName`은 매 로그인마다 `token.getName()`(구글 프로필 이름)으로 갱신되고 유니크 제약도 없어 **이름만 바꾸면 남의 피드백 전문·이미지 URL까지 열람 가능**하다. 보고 후 사용자가 "나만 볼 것"이라며 수정하지 않기로 **의도적으로 결정**했다 — 고치기 전에 반드시 확인할 것 |
| 다중 탭 가드의 읽기-쓰기 원자성 | `localStorage`에 비교·교환(CAS)이 없어 한 틱의 경쟁 구간을 완전히 닫을 수 없다. 코덱스도 "매우 짧다"로 평가 |
| 앵커 리셋의 루프 코스 한계 | 한 바퀴 돌아 제자리로 온 코스는 변위가 작아 방치로 판정된다. 변위만으로는 원리적으로 구분 불가 — 함수 주석에 명시 |
| 앱을 다시 열지 않는 경우의 GPS 경로 잔존 | 브라우저 저장소에 만료 개념이 없어 코드로 막을 수 없다. `allowBackup=false`로 유출 경로만 차단 |
| `fitness` 모듈 삭제 | `FitnessService`(90줄)·`UpsertDailyDistanceResponse` 주입처 0. 3차 결산 삭제와 같은 잣대로 사용자 결정 사안. `DailyDistanceRepository`는 탈퇴 정리가 쓰므로 유지 필수 |

### 가르지 못하는 것 — 포그라운드 복귀 공백

콜백이 끊기는 이유가 둘인데 신호가 같다: ① 안드로이드가 WebView를 재워 실제로 뛴 구간이
기록되지 않음 ② 사용자가 가만히 서 있어 `distanceFilter: 5`가 침묵함.
무조건 리셋(이전)은 ②를 전부 러닝으로 취급했고, 리셋을 없애면 ①의 실제 기록이 잘린다.

**해법**: 앵커가 아직 판정선(30분)에 못 미치면 예전처럼 즉시 리셋하고(잃는 게 없다),
이미 넘겼을 때만 위치 한 점을 받아 공백 시작 지점과의 변위로 가른다. 임계값은 방치 판정이
이미 쓰던 `IDLE_AUTO_PAUSE_MIN_SPAN_M`(50m)을 재사용한다 — 두 장치가 서로 다른 "움직였다"를
쓰면 한쪽이 통과시킨 것을 다른 쪽이 잡는다.

**주의**: 확인이 비동기라 1초 타이머가 먼저 돌면 확인 전에 자동 일시정지가 걸린다 →
`idleCheckDeferredUntilRef`로 최대 15초 유예. 위치를 못 얻으면 **이동한 것으로 본다** —
진짜 기록을 잘라내는 실패가 쉰 시간이 섞이는 실패보다 나쁘다.

> **교훈: 방치 판정은 이미 1초 타이머가 GPS 콜백과 무관하게 돌리고 있었다**(주석에 그 이유가
> 적혀 있다). 앱이 열려 있는 동안에는 처음부터 정상 동작했고, 깨진 건 백그라운드 복귀 한 갈래뿐이다.
> "기능 전체가 잘못됐다"로 넘어가지 말고 어느 갈래인지 먼저 좁힐 것.

### §10 미결 항목 소화 (`76eb702`, `8064c1f`)

§10이 "제품 판단 대기"로 남겨 둔 것 중 셋을 닫았다.

| 항목 | 처리 |
|---|---|
| `CrewDetailResponse.myApplicationStatus` | **제거.** 공개 크루 상세 조회마다 EXISTS를 한 번 더 쓰면서 프론트 참조가 0이었다. 화면은 신청 취소에 requestId가 필요해 결국 별도 API(`useMyApplications`)를 부를 수밖에 없는데, 이 필드는 `"PENDING"` 문자열뿐이라 **처음부터 화면 요구를 못 채우는 설계**였다. 같은 응답의 `inCooldown`·`isFull`은 실제로 쓰이므로 유지 |
| 탈퇴 닉네임 한국어 | **null 위임으로 해결.** 프론트가 이 축의 모든 표시 지점에서 이미 `?? t.no_name`(5로케일)로 받고 타입도 전부 nullable이라, 서버가 굽는 것만 멈추면 됐다. `WITHDRAWN_NICKNAME`·`getDisplayNickname()` 제거, 소비 3곳을 `getNickname()`으로 |
| `FirebaseAuthFilter` 무테스트 | **21케이스 신설**(프로덕션 코드 변경 0). 아래 참조 |
| `fitness` 모듈 삭제 | **하지 않기로 결론.** 실제로 죽은 것은 `FitnessService` 90줄뿐이고, 컨트롤러는 의도적 404 차단막, `DailyDistanceRepository`는 탈퇴 정리가 쓴다. 재개 시 참고할 초안 + 재개 조건이 문서화된 자리라 삭제 실익이 낮다. 낡은 주석(`ChallengeMember.setDistanceAndSync`의 "FitnessService 보정용")만 정정 — 실사용처는 `ChallengeProgressService`인데 주석 때문에 죽은 메서드로 오인됐다 |

### 인증 필터 테스트 — 무엇을 지키려는 것인가

`FirebaseAuthFilter`는 248줄/분기 30개인데 테스트가 0이었고, **저장소 전체에 MockMvc·
SpringBootTest가 없어 어떤 테스트도 이 코드를 태우지 않았다.** 순수 단위 테스트로만 채웠다.

가장 지키려는 것은 **인증을 건너뛰는 경로가 넓어지지 않는 것**이다 — 정규식 하나가 느슨해지면
조용히 뚫린다. 공유·업로드·카카오 경로를 양방향으로 고정했다(숫자 ID만, GET만, 접두사 경계,
꼬리 세그먼트). 그 밖에 Bearer 파싱 경계 5종, 선택 인증 경로가 잘못된 토큰에도 체인을 계속
도는지, `AuthContext`(ThreadLocal)가 성공·거부·체인 예외 전 경로에서 비워지는지.

**함정 둘 (다음에 이 테스트를 만질 때 알아야 할 것):**

- 필터는 `FirebaseApp.getApps().isEmpty()`를 **토큰 검사보다 먼저** 한다. 앱이 없으면 모든
  요청이 `firebase_admin_not_initialized`로 떨어져 토큰 분기를 하나도 못 탄다. 그래서
  네트워크 없이 가짜 자격증명으로 이름 있는 앱을 잠깐 띄우고 `finally`로 반드시 지운다(전역 상태).
- 경로 정규화는 **서블릿 컨테이너 몫**이다. `/api/public/../admin`이 `shouldNotFilter`를
  통과하는 것처럼 보이지만 Tomcat이 `..`를 정규화·거부한 뒤에야 필터가 돈다 — 필터에
  요구할 일이 아니다. 처음에 이걸 결함으로 오인해 테스트를 잘못 썼다.

### 이어서 처리한 것

- **인증 순서 교정** — Firebase 미초기화 검사를 진입부에서 **폴백 직전으로** 옮겼다. 자체 JWT는
  로컬 HMAC 검증만으로 끝나 Firebase가 필요 없는데도, Admin 초기화 실패 하나로 기존 로그인
  사용자까지 전부 401이 됐다. `JwtService.verify`가 서명·발급자·클레임을 모두 확인하고 어떤
  예외도 빈 값으로 떨어뜨리며(시크릿은 기본값이 없어 미설정이면 기동 자체가 안 된다) 통과 조건은
  그대로다. 자체 JWT가 아닌 토큰은 여전히 `firebase_admin_not_initialized`로 fail-closed —
  그 순서가 뒤집히면 인증 없이 보호 구간이 열리므로 테스트로 고정했다.
- **`ChallengeDetail.winner` 제거** — 프론트 참조 0. `WinnerRow` DTO·`ChallengeDetailView.winner`·
  상세 조회의 `resolveWinner` 호출까지 체인 전체를 걷어냈다. `Challenge.winner` 엔티티와
  `findByIdWithDetails`의 fetchJoin은 확정·경품 경로가 쓰므로 그대로 둔다.

### 경품 당첨 판정 테스트 (13케이스)

돈이 걸린 판정인데 테스트가 없었다. 지키려는 것은 **남의 경품을 내 것으로 보여주지 않는 것**과
**받을 사람에게 안 보여주지 않는 것** 두 방향이다.

핵심은 지급 방식별 판정 근거가 **완전히 다르다**는 점이다 — `RANK`는 최종 등수만, 
`RANDOM_FINISHER`는 추첨 결과(`winnerUserId`)만 본다. 한쪽 규칙이 다른 쪽에 새면 조용히 틀린
답이 나가므로, 교차 오염을 양방향으로 고정했다(`doesNotConsultDrawWinner`,
`doesNotConsultFinalRank`). 미완주자가 `NOT_WINNER`가 아니라 `NOT_ELIGIBLE`이어야 하는 것도
포함 — 대상이 아니었던 것과 뽑히지 않은 것은 화면 문구가 다르다.

> **테스트가 비어 있지 않은지 확인했다.** 지급 방식 분기(`== RANDOM_FINISHER`)를 일부러
> 뒤집으니 13개 중 8개가 깨졌다. 새 테스트를 넣을 때는 통과만 보지 말고 이렇게 한 번
> 뒤집어 볼 것 — 목만 잔뜩 세우고 아무것도 검증하지 않는 테스트가 쉽게 만들어진다.

### 여전히 열려 있는 것

- **백엔드 테스트 공백** — `ApiExceptionHandler`, `common/` 순수 유틸(`RaceRules`·
  `TextValidation`·`PageParams`), 알림 리스너 5/6. `KakaoAuthService`는 `HttpClient`가
  필드 초기화라 생성자 주입 선행 필요(§3 재조사 금지 목록 참조).
- **S3 버킷 CORS** — 사진 다운로드 시 OPTIONS 403. 콘솔 작업이라 코드 범위 밖.
- **R8 재활성화** — 켤 수 있는 상태만 복구해 뒀다. Play Console에서 versionCode 8의 크래시
  클러스터를 확인해 원인을 확정한 뒤 판단할 것.
