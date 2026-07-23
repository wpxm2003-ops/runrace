# NSM 개선 계획 — 구현 지시서

> 상태: 확정 · 작성 2026-07-23
> 근거: 런갤(러닝 마이너 갤러리) NSM 자료 11건 종합 분석 + 코드 교차검증(다중 에이전트 검증 후 상위 모델 더블체크 완료)
> 관련: [nsm-roadmap.md](nsm-roadmap.md) — 이 문서는 N1(검증) 게이트의 결과물이며, Phase 1이 곧 "코어 보정"에 해당
> 실행: Phase 1부터 순서대로. 각 Phase는 독립 커밋. **Phase 3은 별도 승인 후 착수.**

---

## 진단 요약 (전부 코드 라인 단위로 검증됨)

| # | 문제 | 위치 | 심각도 |
|---|---|---|---|
| 1 | sub-T 페이스가 체계적으로 ~10초/km 빠르고 세션 간 간격이 너무 좁음(12초/km, 커뮤니티는 ~22초/km) | `frontend/src/lib/nsm.ts:16-17` (±6 오프셋) | **P0** |
| 2 | SHORT/LONG이 거리 기반(1km/3km)이라 느린 러너일수록 렙 시간이 팽창(30분 5K 러너: "short" 6분, "long" 19분) | `nsm.ts:85,91` | **P0** |
| 3 | MEDIUM 휴식 60초는 주 5h+ 고볼륨 전용값인데 전원 적용(커뮤니티 기본 90초) | `nsm.ts:88` | **P0** |
| 4 | 후반 렙에서 페이스 처진 러너에게 "🔻 조금 느려요"로 가속 유도 — NSM 규칙 정반대 | `NsmSessionGuide.tsx:204-205` | **P0** |
| 5 | 주간 볼륨 입력 부재 → 초보도 상급자와 동일 처방(주 <3h 러너 기준 커뮤니티 대비 7~12배 과다) + sub-T 최소 2일 강제로 "주 1회" 표현 불가 | `training/page.tsx:183`, `TrainingPlanService.java:63`, V35 check | P1 |
| 6 | 재측정 유도 없음 — 같은 주가 무한 반복, 5K 22:00→20:30 향상 시 역치 ~18초/km 드리프트 | `weeklyPlan()` 무상태, `TrainingPlanResponse`에 createdAt 미노출 | P1 |
| 7 | 세션 완료가 백엔드에 전혀 기록 안 됨(localStorage만, 런 저장 시 `clearNsmProgress()`로 소거) | `nsmSessionProgress.ts`, `workout/page.tsx:233` | P2 |
| 8 | 역치 검증 밴드 불일치: 프론트 150-600 vs 백엔드 120-900 | `nsm.ts:52-53` vs `TrainingPlanService.java:41` | P2(소형) |

## 커뮤니티 NSM 기준 (런갤 발췌 — 구현 목표값)

- **세션 3종(시간 기반)**: 3분 렙(6~12회, 휴식 60초, 12~15K 페이스) / 6분 렙(3~6회, 휴식 60~90초, 하프~30K 페이스) / 10분 렙(2~4회, 휴식 90~120초, 30K~마라톤 페이스). **짧은 렙일수록 빠르고 긴 렙일수록 느리게 — 간격이 넓다.** 400m·5K 페이스 렙 금지.
- **볼륨 티어**(주간 훈련 시간 → sub-T 처방): <3h → 주1회·15-25분 / 3-4h → 1-2회·25-40분 / 4-5h → 2회·40-60분 / 5-6h → 2-3회·55-75분 / 6-8h → 3회·70-105분. sub-T는 주간 볼륨의 15-25% 상한.
- **휴식**: 저볼륨일수록 넉넉하게. 6분 렙 60초는 고볼륨(5h+)만.
- **회복 기준**: "다음날 이지런 가능, 이틀이면 재훈련 가능". 마지막 렙이 안정적이어야 하고 "조금 더 할 수 있을 것 같은" 느낌으로 종료.
- **재측정**: ~4주마다 5K TT(또는 레이스)로 페이스 갱신. 현재 체력 기준(목표 페이스 아님).
- **더운 날/컨디션 난조**: 5~15초/km 느리게.

**기준 페이스 (10K 45:00, 런갤 표)**: 3분 렙 4:33–4:37 / 6분 렙 4:44–4:50 / 10분 렙 4:50–4:55.
앱 계산(0.88 앵커) 역치 = 277초/km(4:37) — 이 앵커는 유지하고 오프셋으로 맞춘다(아래 기대값 표).

---

## Phase 1 — P0: 처방 상수 + 큐 교정 (프론트만, 한 커밋)

### 1-1. 오프셋 재설계 (`nsm.ts`)
- `SHORT_OFFSET_SEC`: `-6` → **`0`** (가장 빠른 세션 ≈ 역치. 커뮤니티 3분 밴드의 느린 끝 = 보수적)
- `MEDIUM_OFFSET_SEC`: **신설 `+8`** (`mediumSession`의 `targetPaceSec: t` → `t + MEDIUM_OFFSET_SEC`)
- `LONG_OFFSET_SEC`: `+6` → **`+15`**
- `nsm.ts:7-8` 상단 주석의 "검증해야 한다" TODO를 "런갤 표 기준 검증 완료(2026-07)"로 갱신.

**기대값 (10K 45:00 → 역치 277초/km):**

| 세션 | 변경 후 | 런갤 밴드 | 판정 |
|---|---|---|---|
| SHORT | 277 (4:37) | 4:33–4:37 | ✓ 느린 끝 |
| MEDIUM | 285 (4:45) | 4:44–4:50 | ✓ |
| LONG | 292 (4:52) | 4:50–4:55 | ✓ |

### 1-2. SHORT/LONG 시간 기반 전환 (`nsm.ts:85,91`)
- `shortSession`: `repAmount: 1, repUnit: "km"` → **`repAmount: 3, repUnit: "min"`** (10회 유지)
- `longSession`: `repAmount: 3, repUnit: "km"` → **`repAmount: 10, repUnit: "min"`** (3회 유지)
- `NsmSessionGuide`는 이미 min 렙을 완전 지원(MEDIUM 경로: `repTargetSeconds`, 92-97행, 194-197행) — **다운스트림 수정 불필요**. 라벨도 동적 생성이라 i18n 변경 없음. `advanceRep` 탈출구는 그대로 둠.

### 1-3. MEDIUM 휴식 60→90초 (`nsm.ts:88`)
- `restSec: 60` → `restSec: 90`. SHORT 60초·LONG 120초는 커뮤니티와 일치, 유지.

### 1-4. 안티-NSM 큐 수정 (`NsmSessionGuide.tsx:199-208`)
- 마지막 2렙(`prog.repIndex >= reps - 2`)에서 `repPace > targetPace + 6`이면 `nsm_cue_slow` 대신 **신규 키 `nsm_cue_hold`** 표시. 톤: "무리하지 않아도 돼요 — 이 페이스로 마무리" (가속 유도 금지, 조기 종료 허용 뉘앙스). 색상은 amber 유지.
- 초반 렙(마지막 2렙 이전)의 `nsm_cue_slow`는 유지.
- (권장) 시작 카드에 한 줄 추가: 신규 키 `nsm_hot_day_note` — "덥거나 컨디션이 안 좋은 날은 5~15초/km 느리게 뛰어도 충분해요".
- 신규 i18n 키는 **ko/en/es/ja/zh 5개 전부** (`translations.ts`, 기존 `nsm_cue_*` 블록 옆에).

### 1-5. 테스트 (`frontend/tests/nsm.test.ts`)
- 기존 테스트는 오프셋 변경에도 통과 확인(121-128행 short<medium<long 부등호는 새 오프셋에서도 성립).
- 추가: ① 10K 45:00 → SHORT/MEDIUM/LONG targetPaceSec = 277/285/292 정확값 고정 ② SHORT/LONG `repUnit === "min"`, `repAmount` 3/10 ③ MEDIUM `restSec === 90`.

**검증**: `frontend`에서 `npx tsc --noEmit` + `npm test`. 백엔드 무관(저장 스칼라는 vdot/threshold뿐 — 세션 구조는 프론트 파생).

---

## Phase 2 — P1: 볼륨 티어 + 재측정 배너

### 2-A. 주간 볼륨 입력 & 티어 스케일링
**프론트:**
- `training/page.tsx`에 주간 러닝 시간 밴드 선택 UI(5개: <3h / 3-4h / 4-5h / 5-6h / 6-8h+). 신규 i18n 키.
- `nsm.ts`에 티어 상수 테이블 (rep 수 스케일):

| 티어 | 허용 sub-T 일수 | SHORT(3분) | MEDIUM(6분) | LONG(10분) | 주간 sub-T 합(3세션 시) |
|---|---|---|---|---|---|
| <3h | **1** | 6회(18분) | 3회(18분) | 2회(20분) | 1세션만 → 18~20분 ✓ |
| 3-4h | 1~2 | 7회 | 3회 | 2회 | ~39분 ✓ |
| 4-5h | 2 | 8회 | 4회 | 2회 | ~48분(2세션) ✓ |
| 5-6h | 2~3 | 9회 | 4회 | 3회 | 2세션 ~51분 / 3세션 81분(경고) |
| 6-8h+ | 2~3 | 10회 | 5회 | 3회 | 90분 ✓ (현행 값) |

- **acceptance 테스트로 고정**: 각 티어의 주간 sub-T 총 시간이 커뮤니티 밴드(15-25/25-40/40-60/55-75/70-105분) 이내. 벗어나면 rep 수 조정.
- `weeklyPlan(thresholdSec, subTDays, tier?)` — tier 미지정 시 최상위 티어(하위호환).
- `onToggleDay` floor `2` → 티어별 min/max 동적(최소 1). 티어 대비 sub-T 일수 초과 선택 시 dose-cap 경고(소프트, 기존 인접일 경고 패턴 재사용).

**백엔드 (⚠️ 프론트 floor만 풀면 저장이 400으로 깨짐 — 반드시 함께):**
- `TrainingPlanService.normalizeSubTDays` (63행): `< 2` → `< 1`.
- **V50 신규 마이그레이션** (V49 `crew_month_goal`까지 사용됨 — V35 수정 절대 금지):
  - `training_plan.sessions_per_week` check `between 2 and 3` → drop 후 `between 1 and 3` 재생성
  - `weekly_band` 컬럼 추가(nullable smallint 1~5 또는 varchar)
  - V44 스타일 코멘트 갱신 포함
- `TrainingPlanRequest/Response`에 `weeklyBand` 추가, `TrainingPlan` 엔티티 `of/update` 경로 반영. Mockito 단위테스트 갱신.

### 2-B. ~4주 재측정 배너
- `TrainingPlanResponse`에 `updatedAt` 노출 (엔티티에 이미 존재: `TrainingPlan.java:48-52` — 노출만 하면 됨. 재측정 기준이므로 createdAt이 아닌 **updatedAt** 사용: 플랜 갱신 시 리셋되어야 함).
- 프론트 `types.ts` 타입 추가 → `training/page.tsx`: 플랜 나이 ≥28일이면 상단 배너 "최근 기록으로 페이스를 다시 맞춰보세요" → 계산기 섹션 포커스. 신규 i18n 키 5개 언어.

### 2-C. (소형) 역치 밴드 정합
- `TrainingPlanService.java:41`: `120~900` → 프론트와 동일한 `150~600`. 검증 로직만이라 마이그레이션 불필요. 주석의 범위 표기도 갱신.

**검증**: `backend`에서 `./mvnw test` + `frontend`에서 `npx tsc --noEmit`·`npm test`. 로컬 DB에 V50 즉시 적용됨 — 적용 후 수정 금지.

---

## Phase 3 — P2: 세션 완료 로깅 (**별도 승인 후 착수**)

[nsm-roadmap.md](nsm-roadmap.md) N2와 동일 스코프. 요지만:
- V51+ `nsm_session_log(id, user_id, day, kind, workout_id, completed_at)`.
- `workout/page.tsx` `saveSnapshot()` 성공 후, frozen된 `nsmToday.isSubT`면 완료 POST (현재 233행에서 `clearNsmProgress()`로 소거되는 시점 **이전**에 판단 값을 캡처).
- training 페이지에 "이번 주 sub-T N/M 완료" 표시. rep 적중률은 후속.
- 이 데이터가 쌓인 뒤에야 재측정 너지 고도화·자동 조정 가능.

## 하지 말 것

1. **캘린더 기반 rep 자동 증가(주차 진행) 금지** — 완료 데이터(Phase 3) 게이트 없이 달력만으로 rep를 올리면 NSM이 막으려는 피로 누적을 앱이 유발함. 하려면 반드시: 보수적 onramp에서 시작해 위로 + 완료/피드백 게이트.
2. **적용된 마이그레이션(V1~V49) 수정 금지** — 로컬 DB에 즉시 적용되어 체크섬 깨짐. 항상 새 버전.
3. **Toss 러닝코치와 "5K→스케줄 생성" 정면 경쟁 포지셔닝 금지** — 유통에서 진다. 차별화 축: ① 검증된 정확한 처방(Phase 1이 전제) ② 런 중 라이브 렙 가이드(중기: 오디오/햅틱 큐로 워치 대비 약점 보완) ③ crew↔NSM 소셜 레이어(Phase 3의 완료 데이터가 전제 — 현재 crew 코드에 NSM 통합 0).

## 공통 가드레일

- `frontend/AGENTS.md`: 커스텀 Next.js — 새 API 쓰기 전 `node_modules/next/dist/docs/` 확인.
- 신규 i18n 키는 ko/en/es/ja/zh **5개 로케일 전부**, 기존 `nsm_*` 키 블록 위치에.
- 푸시 전: `backend ./mvnw test` + `frontend npx tsc --noEmit` (+ `npm test`) 통과 — 예외 없음.
- 커밋/푸시는 사용자가 명시적으로 요청할 때만.
