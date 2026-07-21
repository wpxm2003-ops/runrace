# 헬스앱/워치 데이터 동기화 설계 (A + C + D)

> 상태: **보류 (2026-06-11, 2026-07-21 시장근거 재확인)** — 설계는 합의됐으나 Google Play 건강데이터 심사 리드타임/반려 리스크가 커서 다른 우선순위 먼저. 재개 시 이 문서부터. **보류 유지 결정 근거는 §9(2026 시장 조사) 참고.**
> 범위: Android Health Connect 임포트 — A(워치→앱 가져오기), C(과거 백필), D(중복 머지)
> iOS(HealthKit)는 동일 모델 위에 후속 확장. 현재 iOS 빌드 미생성이라 1차 범위에서 제외.

## 1. 목표

RunRace는 지금 운동을 **직접 추적**한다:
- 야외: GPS (`@capacitor-community/background-geolocation`)
- 실내: 수동 입력 + 트레드밀 사진(EXIF 시각)

이 설계는 "직접 추적" 외에 **OS 건강 데이터 허브에서 읽어오는** 세 번째 경로를 추가한다.

- **A**: 워치/밴드로 뛴 러닝을 앱에서 가져와 레이스 기록으로 등록
- **C**: 가입 시/온디맨드로 과거 N일 러닝을 한 번에 백필
- **D**: 우리 GPS 기록과 임포트 기록이 겹칠 때 중복으로 집계되지 않게 머지/스킵

비목표(1차): iOS, 심박 병합(시나리오 B), 자동 백그라운드 동기화(E). 모델은 확장 가능하게 두되 구현은 후속.

## 2. 데이터 소스 전략

워치 제조사 SDK에 직접 붙지 않는다. **Health Connect 한 곳만** 읽는다.

```
갤럭시워치 → 삼성헬스 ─┐
Fitbit ──────────────┤→ Health Connect (Android 건강 허브) → RunRace
Garmin Connect ──────┤      (ExerciseSession / Distance / 
Mi Fitness ──────────┘       ActiveCalories / HeartRate 레코드)
```

전제: 사용자가 "워치 → 제조사 앱 → Health Connect 동기화"를 켜둬야 한다(대부분 제조사 앱에서 토글 1개). 우리는 그 결과만 읽는다.

읽을 레코드:
- `ExerciseSessionRecord` (운동 타입=러닝, 시작/종료) — **기준 레코드**
- `DistanceRecord` (거리)
- `TotalCaloriesBurned` 또는 `ActiveCaloriesBurned` (칼로리)
- `HeartRateRecord` (심박 — 1차엔 저장만, 표시는 B에서)

각 세션엔 Health Connect가 부여한 **안정적 식별자**(record id + originating app package)가 있어 중복키로 쓴다.

## 3. 데이터 모델 변경

### 3.1 `workout_session` 확장 (신규 마이그레이션 `V22__workout_external_source.sql`)

```sql
alter table workout_session
  add column source            varchar(16) not null default 'GPS',   -- GPS | INDOOR | HEALTH_CONNECT
  add column external_id        varchar(255),                          -- Health Connect record id
  add column external_app       varchar(255),                          -- originating package (com.sec.android.app.shealth 등)
  add column avg_heart_rate     int,
  add column imported_at        timestamptz;

-- 같은 유저가 같은 외부 운동을 두 번 임포트하지 못하게
create unique index uq_workout_external
  on workout_session (user_id, external_app, external_id)
  where external_id is not null;
```

- 기존 `workout_type`(GPS/INDOOR) enum은 유지하되, 신규 `source`로 출처를 일원화 권장. (또는 `WorkoutType`에 `HEALTH_CONNECT` 추가 — 아래 4.1에서 택1)
- 부분 유니크 인덱스가 **D의 1차 방어선**(완전 동일 레코드 재임포트 차단).

### 3.2 엔티티/DTO
- `WorkoutSession`에 `source`, `externalId`, `externalApp`, `avgHeartRate`, `importedAt` 필드 추가.
- 임포트 기록은 `pathJson`이 없을 수 있음(워치가 GPS 경로를 안 줄 수 있음) → `path_json not null` 제약을 `'[]'` 기본 허용 또는 nullable로 완화 필요. **마이그레이션 시 주의 포인트.**

## 4. API 설계

### 4.1 임포트 엔드포인트

```
POST /api/workouts/import
body: {
  items: [{
    externalId, externalApp,
    startedAt, endedAt, durationSec, distanceM,
    calories?, avgPaceSecPerKm?, avgHeartRate?,
    path?            // 있으면 저장, 없으면 []
  }]
}
response: {
  imported:  [{ externalId, recordId }],
  skipped:   [{ externalId, reason: "DUPLICATE_EXTERNAL" }],
  conflicts: [{ externalId, conflictWith: recordId, reason: "OVERLAPS_GPS" }]
}
```

- 배열 입력 → A(소량)와 C(백필 대량)를 같은 엔드포인트로 처리.
- 서버가 D 판정을 수행하고 결과를 셋으로 분류해 돌려준다. 클라가 conflicts에 대해 사용자 선택 UI를 띄운다.

### 4.2 중복 판정(D) 로직 — 서버

1. **완전 중복**: `(user, externalApp, externalId)` 유니크 인덱스 위반 → `skipped: DUPLICATE_EXTERNAL`.
2. **시간 겹침**: 동일 유저의 기존 기록과 시간 구간이 겹치고(예: 시작/종료 ±5분 이내) 거리 근접(±10%)이면 → `conflicts: OVERLAPS_GPS`. 자동 저장하지 않고 사용자에게 머지/스킵/둘다보관 선택.
3. 그 외 → `imported`.

> 핵심 불변식: **레이스 랭킹·누적거리는 같은 물리적 운동을 두 번 세면 안 된다.** D가 없으면 야외 1회 러닝이 GPS+워치로 2건 집계되어 랭킹 신뢰도가 붕괴된다. → D는 옵션이 아니라 필수.

## 5. 클라이언트(Capacitor) 설계

### 5.1 플러그인
- Health Connect 지원 Capacitor 플러그인 도입(후보 조사 별도). 미존재/부족 시 얇은 자체 브리지(Kotlin) — Health Connect Client SDK의 `readRecords` 호출만 감싸면 됨.
- Android 권한: `android.permission.health.READ_EXERCISE`, `READ_DISTANCE`, `READ_TOTAL_CALORIES_BURNED`, `READ_HEART_RATE`.
- `AndroidManifest`에 Health Connect 권한 노출용 intent-filter + 권한 근거 화면 필요.

### 5.2 UX 흐름

**A — 가져오기 배너**
```
워크아웃 화면 진입 → lastSyncedAt 이후 신규 세션 조회
→ "동기화 가능한 운동 N건" 배너 → 탭 → 목록(거리/시간/페이스/출처앱)
→ 선택 임포트 → POST /import → 결과 토스트
```

**C — 백필**
```
온보딩 직후 또는 설정 → "최근 30일 러닝 불러오기"
→ readRecords(기간=30d) → /import 배치 → 진행률 표시
→ 누적거리/랭킹 초기값 반영
```

**D — 충돌 머지 UI**
```
/import 응답의 conflicts 각 항목:
"이 운동이 기존 기록과 같아 보여요"
  [워치 기록으로 교체] [기존 GPS 유지] [둘 다 보관]
→ 선택을 후속 호출로 확정 (PATCH /workouts/{id} 또는 import 재호출 with resolution)
```

## 6. 권한·심사 (출시 게이트)
- **Google Play 건강데이터 선언**: Health Connect READ 권한 사용 시 별도 정책 심사. 데이터 사용 목적("운동 기록 가져오기/랭킹 반영") 명시 + 개인정보처리방침 갱신 필요. **리드타임 큼 → 일찍 착수.**
- 최소 권한 원칙: 1차엔 EXERCISE/DISTANCE/CALORIES만, HEART_RATE는 B 도입 시점에 추가 검토.

## 7. 단계별 진행안

| 단계 | 내용 | 산출물 |
|---|---|---|
| 0 | 플러그인 후보 조사 + 자체 브리지 여부 결정 | 결정 메모 |
| 1 | 마이그레이션 V22 + 엔티티/DTO + `/import`(D 판정 포함) | 백엔드 PR |
| 2 | Health Connect 읽기 브리지 + 권한 화면 | 안드 PR |
| 3 | A 배너 + 임포트 UI | 프론트 PR |
| 4 | D 충돌 머지 UI | 프론트 PR |
| 5 | C 백필(기간 확장 + 배치 진행률) | 프론트 PR |
| 6 | Play 건강데이터 심사 제출 | 출시 |

## 8. 미해결 질문
- `source` 신규 컬럼 vs `WorkoutType`에 enum 추가 — 어느 쪽? (출처와 종류가 직교하므로 분리 권장)
- `path_json` nullable 완화 방식 (기본 `'[]'` vs nullable)
- 충돌 판정 임계값(시간 ±5분 / 거리 ±10%)을 어디서 튜닝 가능하게 둘지
- 백필 기본 기간(30d? 90d?) 및 1회 배치 상한

## 9. 2026 시장 조사 — 왜 아직 보류인가 (2026-07-21)

> 다중 소스 웹 조사 + 주장별 적대적 검증(22개 확정/3개 반박). 이 설계의 §2(Health Connect 단일 창구) 전략이 여전히 유효함을 확인했으나, **지금 착수할 근거는 없음**을 재확인.

### 9.1 데이터 경로는 기술적으로 다 열려 있다 (커버 가능)

| 소스 | Health Connect 지원 | 방향 | 우리(안드로이드)가 받나 |
|---|---|---|---|
| 삼성 갤럭시워치 → 삼성헬스 | ✅ v6.22.5(2022.10)~ | 양방향 | ⭕ (2-hop: 워치→폰 삼성헬스→HC) |
| Garmin → Garmin Connect | ✅ 2025.7~ (5.14.1) | 단방향(export) | ⭕ (기본 러닝지표만; VO2/파워/HRV 제외) |
| Strava | ✅ **안드로이드 앱 한정** write | Strava→HC | ⭕ (시간·거리·칼로리만; 심박·경로·스플릿 없음) |
| **애플워치 → Apple Health** | ❌ 안드로이드/HC 연동 불가 | — | **✕ 원천 배제** |

→ 삼성·가민·Strava 3대 소스는 HC 한 곳으로 다 들어옴. §2의 "제조사 SDK 직접 안 붙고 HC만 읽는다" 전략이 옳았음(특히 Strava→HC는 안드로이드 전용이라 우리 Android-first와 정합).

### 9.2 그러나 "실제 도달 유저"는 다단계 opt-in에 막힌다 (핵심 리스크)

- **세 경로 전부 기본값 아님.** Health Connect 플랫폼 자체가 명시적 인가 모델 — 자동/기본 공유 없음.
  - 유저가 소스 앱에서 HC 연동을 **수동으로 켜고** + 타입별 read/write 권한 허용
  - 삼성헬스는 **클라우드 동기화까지** 필요 + 앱 재실행
- **삼성헬스 2025 운동(exercise) 쓰기 회귀 버그** 다수 보고 — 러닝 앱에 가장 중요한 워크아웃 타입 신뢰성이 시점에 따라 불안정.
- **"HC 깔려있다 ≠ 연결해뒀다."** 갤럭시/가민/Strava 유저 중 실제로 HC 연동을 켜둔 비율은 **어떤 공개 데이터에도 없음**(정량 공백). 이런 백그라운드 연동 완료율은 경험칙상 매우 낮음.
- 애플워치는 Strava 기준 **최다 기록 디바이스(#1)** 인데 통째로 배제됨.

### 9.3 결론 (제품 판단)

- **직접 Garmin API: 폐기.** 파트너 심사(용도·데이터처리 검토, 승인 2일+통합 1~4주) + OAuth1.0a 서버 웹훅으로 무겁고, **2025~26 현재 프로그램 보류/중단** 상태. ROI 최악. → §2의 "SDK 직접 안 붙음"과 동일 결론.
- **Health Connect 경유: 죽은 카드는 아니나 지금은 아님.** 재개 시 **삼성헬스→HC 단일 경로 최적화가 최대 ROI**(한국 갤럭시 지배력; 가민·Strava는 덤). 단 도달률이 **온보딩 연결 유도 품질**에 전적으로 걸리고, 그 전에 **연결할 활성 유저가 있어야** 의미가 생김.
- **재개 트리거**: 유저 밀도 확보 후 참여 증폭이 필요할 때 + *"내 워치 기록도 레이스에 넣고 싶다"* 실수요가 실제로 쌓일 때. 포지셔닝(§ [product-positioning.md](product-positioning.md) 7)의 "추적은 아웃소싱, 임포트는 경쟁 연료" 관점 그대로.

### 9.4 근거가 약한 부분 (재개 시 재확인)
- 삼성헬스 MAU 7,700만 = **글로벌·삼성 자체 PR**(한국 한정 아님, 독립 감사 없음).
- Strava 디바이스 순위 = **애플 편중 글로벌** 표본이라 한국 점유율로 직접 환산 불가.
- 한국 한정 워치 브랜드 믹스(갤럭시/가민/애플/Coros)·런갤 가민 매니아층 규모 = 정량 수치 미확보.
- 삼성헬스 운동 쓰기 버그의 2026 현재 해결 여부 미확인.
- HC 전달 필드(시간/거리/칼로리, 삼성은 심박)가 RunRace 경쟁 지표(페이스 스플릿·GPS 경로·러닝 다이나믹스)에 **충분한지** — 직접 API 없이는 핵심 지표 부족 가능성.
