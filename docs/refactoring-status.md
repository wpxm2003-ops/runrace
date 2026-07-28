# 리팩토링 현황 기록 (2026-07-28, 3차 갱신)

> 목적: 다음 리팩토링 때 처음부터 재점검하는 수고를 덜기 위한 스냅샷.
> 이 문서의 "하지 않은 것 + 이유"가 핵심 — 겉보기에 중복 같지만 실제로는 다른 것들을 다시 조사하지 말 것.
> 1차 커밋 범위: `63cf0c2..7fb82b3`(19커밋). 2차(다음 후보 소화) 커밋 범위: `7c04fdc..2127724`(15커밋).
> 3차 조사 범위: `2127724..HEAD`(74커밋/218파일/+10528줄) — 2차 이후 신규 코드 전체. §8 참조.
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

- 프론트: `npx tsc --noEmit` + `npx eslint` + `npm run build` + `npm run test`(vitest 123)
- 백엔드: `./mvnw.cmd -q -o test`
- 리팩토링 원칙: 한 커밋=한 추출, 추출은 이동이지 개선이 아님(다듬고 싶으면 별도 커밋), 동작 변경은 커밋 메시지에 ⚠️ 명시.
