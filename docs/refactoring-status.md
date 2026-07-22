# 리팩토링 현황 기록 (2026-07-22)

> 목적: 다음 리팩토링 때 처음부터 재점검하는 수고를 덜기 위한 스냅샷.
> 이 문서의 "하지 않은 것 + 이유"가 핵심 — 겉보기에 중복 같지만 실제로는 다른 것들을 다시 조사하지 말 것.
> 커밋 범위: `63cf0c2..fe62a23` (리팩토링 19커밋). 전 커밋이 게이트(tsc `--noEmit` / eslint / next build / vitest 123개 / mvnw test 209개) 통과.

## 1. 완료된 것 — 신설 공용 모듈

| 모듈 | 역할 | 소비처 수 |
|---|---|---|
| `frontend/src/app/_components/ui/BottomSheet.tsx` | 바텀시트 오버레이+stopPropagation+useNativeBack 소유. zIndexClass/panelClassName은 리터럴로 주입 | 6 (ApplyModal, RejectModal, PrizeEditorModal, ShoeFormSheet 메인+브랜드, CrewRegionPickerSheet) |
| `frontend/src/app/_components/ui/Badge.tsx` | amber(리더/라이벌)·emerald(나/참여중) 2톤 뱃지 | 13곳 |
| `frontend/src/app/_components/ImageLightbox.tsx` | 멀티이미지 갤러리 뷰어(스와이프+카운터+useNativeBack). 단일 이미지면 자동 축퇴 | CrewDetailContent, ChallengeDetailContent |
| `frontend/src/lib/api/errorMap.ts` `mapErrorMessage(e, rules, fallback)` | 에러코드→i18n 매핑 루프. **fallback은 반드시 함수**(reportAndDisplay 부수효과 방지) | 16곳 |
| `frontend/src/lib/format.ts` 추가분 | `shortMonthDay`(date-only 전용)·`addDaysIso`·`todayIso`·`monthDayLabel` | crew 계열 |
| `frontend/src/lib/api/hooks.ts` `SWR_INFINITE_CONFIG` | useSWRInfinite 공통 옵션(무한스크롤 5훅 전부 사용) | 5 |
| `frontend/src/app/crew/_components/` | crew/page.tsx 1206→80줄, settings 726→161줄로 분해된 19개 컴포넌트 | — |
| `backend .../common/KstTime.ZONE` | Asia/Seoul ZoneId 단일 출처 (5개 서비스) | 5 |
| `backend .../common/PageParams.clamp(page,size)` | page≥0, 1≤size≤50 클램핑 단일 출처 | 컨트롤러 4 + 서비스 2 |
| `backend .../crew/service/CrewGuards` | requireMembership 공유. **정적 유틸인 이유**: 빈으로 빼면 서비스 생성자가 바뀌어 테스트 Mockito 세팅 전면 수정 필요 | CrewService, CrewMatchService |
| `backend` CrewService→`ForbiddenTextChars` | 자체 char 배열 폐기, 제어문자까지 차단(검증 강화) | — |
| `backend` CrewMatchService `finalizeIfNeeded` | "ACCEPTED+기간종료→확정" 4곳 통합, end_at null 방어 포함 | 4 |

리팩토링 중 발견·수정된 실버그 3건:
- `GET /api/challenges`·`/mine`이 page 클램핑 누락 → 음수 page가 500+에러로그 오염 (`523f5e3`)
- errorMap fallback 즉시평가였으면 처리된 에러마다 리포트 중복 발송 (`6077ee0`에서 설계로 차단)
- eslint가 `android/` 빌드 산출물을 스캔해 가짜 에러 40개로 실제 결과를 가림 (`5f01273`) — 이후 lint 완전 클린(경고 0)

## 2. 재검증 스윕 결과 (프론트/백엔드 별도 전수 스캔)

- **치환 누락: 최종 0.** 스윕에서 나온 낙오 12곳(Badge 5, mapErrorMessage 7)·죽은 코드 2건(`CrewRecapCard.tsx` 238줄, `ChallengeWorkoutRepository.findByChallengeIdAndWorkoutSessionId`)·브랜드 시트 1건 전부 후속 커밋으로 처리 완료.
- 백엔드 리포지토리 **전 메서드(~100개) 호출자 전수 확인** — 위 1건 외 데드 없음. `CrewMatchRepository.findActiveWithStatuses` 등 직접 호출 0처럼 보이는 것들은 같은 인터페이스의 default 메서드가 래핑하는 쿼리 백엔드라 데드 아님.

## 3. 의도적으로 하지 않은 것 (재조사 금지 목록)

### 프론트
| 항목 | 이유 |
|---|---|
| `MatchRow` vs `HistoryRow` 병합 | 이름만 비슷. 전자는 사전 포맷 텍스트 한 줄+화살표(홈 요약), 후자는 match 객체에서 상대·상태·기간·결과를 파생하는 카드(내역). 중복 아님 |
| `crew/match/page.tsx:30` `shortDate` | datetime+TZ 입력을 `new Date()`로 파싱 — date-only `split("-")` 전용인 `shortMonthDay`와 계약이 다름. 합치면 날짜 하루 밀림. `format.ts:94-97` 주석에 문서화됨 |
| `useAsyncAction` 훅 | 30콜사이트의 busy 모양(boolean vs per-item id)·confirm 유무·리포트 방식·성공경로 순서가 제각각. 공통부는 이미 `handleAuthFailure`로 공유 중이라 실익 없이 위험만 큼 |
| `useImageUpload` 훅 | 4곳 동작이 실제로 다름: WorkoutPhotoButton(단일+교체/삭제), ProfileSection(4슬롯 그리드), PrizeEditorModal(비공개키+object-URL 장부), ImageUploadField(서버 업로드 없음, EXIF+압축만) |
| WorkoutPhotoButton 내장 뷰어 → ImageLightbox | 뷰어에 변경/삭제 액션 푸터가 내장 — ImageLightbox에 액션 슬롯 추가 설계가 선행돼야 함 |
| FilterChip (RegionChip↔요일칩 통합) | padding(py-1 vs py-1.5)·shrink-0·transition-colors 실제 차이 — 합치면 시각 회귀 |
| `nudge_daily_limit` 에러 분기 2곳 (`CrewHome.tsx`, `ChallengeDetailContent.tsx`) | 메시지 선택이 아니라 `setNudgedIds` 상태변경 부수효과 포함 — mapErrorMessage(string 반환)에 담을 수 없음 |
| `isAuthError`/`isNotFoundError` | boolean 분류 헬퍼지 에러→메시지 매핑이 아님 |
| 중앙정렬 다이얼로그(`ConfirmProvider:52`, `WorkoutCelebration:94`)·풀스크린(`RunLockOverlay:60`, `WorkoutPhotoButton:104`) | 바텀시트 구조가 아님 — BottomSheet 대상 아님 |
| `WelcomeOnboarding:52` | 오버레이 구조는 같지만 **의도적으로 백드롭 탭 닫기가 없음**(비-dismissible 온보딩). BottomSheet는 onClose 강제라 드롭인 불가 |
| training 페이지 zinc 커스텀 태그 | Badge는 amber/emerald 2톤 설계 — 범위 밖 |
| `lib/workoutTrack.ts`(591줄)·`lib/api/types.ts`(523줄) | 단일 관심사/타입 정의 — 분해 실익 낮음 |

### 백엔드
| 항목 | 이유 |
|---|---|
| 네이티브 SQL 12개 → QueryDSL 이관 | KST 날짜 집계·CTE(gaps-and-islands)·윈도우 함수라 QueryDSL로 표현 불가/위험. 현재 분리(동적조건=QueryDSL 5impl, 단순=JPQL 30, 분석=네이티브 12)가 올바른 설계 |
| `@Scheduled(zone="Asia/Seoul")` 문자열 잔존 | 애노테이션 속성은 컴파일 상수만 — KstTime.ZONE 사용 불가 |
| SQL 내 `at time zone 'Asia/Seoul'` | SQL 리터럴, Java 상수와 무관 |
| CrewService 월요일정렬 주시작 vs ReengagementScheduler 롤링7일 | **다른 개념** — KstTime은 타임존만 공유, 경계 계산 통합 금지 |
| `TextValidation.requireCleanText` 전면 채택 | blank→null(선택필드) 시맨틱 미지원 + `_chars` 접미사 에러코드라 프론트 매핑 재작업 필요. containsForbiddenChar 내부만 위임한 현 상태가 적정 |
| `Clock` 주입 (`OffsetDateTime.now()` 75회/29파일) | 전 서비스 생성자+Mockito 세팅 전면 변경 — 시간의존 테스트가 필요해질 때 착수 |
| `WorkoutService.java:145` `Math.max(1, Math.round(...))` | 칼로리 하한이지 페이지네이션 아님 — PageParams 대상 아님 |

## 4. 다음 리팩토링 후보 (우선순위순)

1. **CrewMatchStatusBadge 추출 + IN_PROGRESS 색 불일치 수정** — `crew/matches/page.tsx:31-35`(sky) vs `crew/match/page.tsx` 상세 인라인(emerald). 같은 상태가 화면마다 다른 색 = 잠재 시각 버그. 어느 색이 정답인지 결정 필요(레이스 phase 뱃지는 sky 사용 중). `ChallengePhaseBadge`는 3상태 전용이라 재사용 불가, 6상태 전용 컴포넌트 신설이 맞음.
2. **공용 SelectSheet** — `CrewRegionPickerSheet`(BottomSheet+listbox+✓)를 제네릭화해 ShoeFormSheet 브랜드 시트와 통합. 이제 두 곳 다 BottomSheet 기반이라 순수 추출.
3. **Field/TextInput 폼 프리미티브** — `rounded-lg border border-zinc-300 …` 인풋 22회/12파일. 라벨 스타일 2종(text-sm zinc-500 vs text-xs font-medium zinc-600) 혼재는 variant로 보존할 것.
4. **AsyncBoundary** — 로딩/에러/빈상태 3분기 6곳+ (`crew/page.tsx`, `crew/settings`, `crew/matches:116-127`, `crew/match:124-142`, records/shoes/my/rivals). 단 콜사이트마다 빈상태 조건·placeholder가 달라 "무변경 이동"이 안 됨 — 신중히.
5. **GifticonViewer → ImageLightbox** — `ChallengePrizes.tsx:127`은 순수 단일 이미지 뷰어라 거의 드롭인. (WorkoutPhotoButton 뷰어는 §3 참조, 별개)
6. **백엔드 테스트 공백** — 우선순위: NudgeService(일일제한·자기넛지 가드), ShoeService(보유수·활성교체), ChallengeScheduler 온램프 생성부(`ensureOpenPublicRace`·`sweepRaceLifecycle` 호출 0), ReengagementScheduler, CrewMatchScheduler, PushService, UserProvisioning/KakaoAuth(보안 민감, Firebase 모킹 필요).
7. **`not_in_crew` 상태코드 3분기 정합성** — CrewGuards=404, `ChallengeService.java:96`=400, `NudgeService.java:91`=403. 같은 에러코드가 3개 상태로 나감. 통일하려면 CrewGuards public 승격+상태 합의(제품 결정).
8. **"별도 backdrop + fixed 하단 패널" 3종** — `DateTimePickerSheet:264`, `GhostPicker:134`, `RecordsStatsPanel:87`. BottomSheet와 다른 구조(하단 고정 드럼/패널)라 이관 시 구조 변경 필요. 낮은 우선순위.
9. `lib/api/hooks.ts`(595줄) 도메인별 분리, `CrewMatchNotifications` 링크 리터럴 5회 → `matchLink()` 헬퍼(ChallengeNotifications 선례), 랜덤 변형키 패턴 3회 추출, challenge 이벤트 top-level 4개 → `ChallengeEvents` 통합, JPQL 텍스트블록/`"+"` 혼용 통일 — 전부 코스메틱급.

## 5. 수동 확인 필요 (자동검증 불가였던 것)

- **실기기(Android WebView) 백버튼**: ① 챌린지 상세 실내러닝 사진 뷰어 — ImageLightbox 통합으로 백버튼 닫기가 **새로 생김**(`f490812`). ② 신발 등록 브랜드 시트 — BottomSheet 전환 후 "브랜드 시트만 닫힘→폼 유지" 순서(`fe62a23`). 둘 다 로그인/실기기 필요라 브라우저 검증 못 함.
- 크루 발견 무한스크롤 트리거가 40px 일찍 발동 (`8d7a3b6`, rootMargin 160→200px 통일) — 실사용 체감 확인.

## 6. 검증 게이트 (이 세션에서 쓴 기준)

- 프론트: `npx tsc --noEmit` + `npx eslint`(이제 노이즈 0이라 신뢰 가능) + `npm run build`(정적 export가 라우팅 회귀 1차 방어) + `npm run test`(vitest 123)
- 백엔드: `./mvnw.cmd -q -o test`(209)
- 리팩토링 원칙: 한 커밋=한 추출, 추출은 이동이지 개선이 아님(다듬고 싶으면 별도 커밋), 동작 변경은 커밋 메시지에 ⚠️ 명시.
