# 크루 발견 + 가입신청(승인제) 설계

> 상태: **설계 확정 대기 (작성 2026-07-21)** — 구현 착수 전 리뷰용. 사용자 결정 7건 반영.
> 관련: [competition-roadmap.md](competition-roadmap.md) (P3 크루 축) · [product-positioning.md](product-positioning.md)
> 배경: 러닝라이프(runninglife.co.kr/crew) 크루 디렉터리를 벤치마크. 단 러닝라이프는 **오프라인 모임 디렉터리**(SNS로 이탈 가입)라, 핵심 정보(장소·정기런)만 선택 필드로 차용하고 가입은 **앱 내 승인제**로 재설계.

---

## 1. 목표

현재 크루 발견 목록은 `이름 + 인원수`뿐이고, 가입은 **초대코드 6자만** 가능(닫힌 모델). 이걸:

1. **목록 리치화** — 대표이미지(선택) + 지역 + 인원 + 정기런 요약
2. **지역 필터** — 시도 17개 + 온라인
3. **공개 크루 상세 페이지** — 소개·이미지·정기런 정보 + 가입신청 CTA
4. **승인제 가입** — 목록/상세에서 **가입신청 → 리더 승인/거부** (초대코드는 즉시가입으로 병행 유지)
5. **푸시 알림** — 신청 접수(→리더), 승인/거절(→신청자, 거절 사유 선택 포함)

원칙: 초대코드=신뢰 즉시가입, 신청=공개 발견 경로(리더 게이트). 발견 기반 성장을 열되 난입은 리더가 막는다.

## 2. 확정된 결정 (사용자)

| # | 결정 |
|---|---|
| 1 | 리더에게 "새 가입신청" 푸시 **넣음** |
| 2 | 지역 = **시도 17개**(+ 온라인) |
| 3 | 이미 크루 있으면 신청 **불가** → "먼저 지금 크루를 나가야 해요" 안내 |
| 4 | 여러 크루 동시 신청 **허용**, 한 곳 승인 시 나머지 pending **자동 취소** |
| 5 | 정원 찼으면 신청 버튼 **"정원 마감" 비활성** + 승인 순간 정원 재확인 |
| 6 | 거절 후 **24h 쿨다운**(같은 크루) |
| 7 | 신청 시 **한마디(선택)** 첨부 |
| + | 공개 **크루 상세 페이지** 신설(카드 → 탭 → 상세 → 신청) |

## 3. 데이터 모델 (마이그레이션 V45)

### 3.1 `crew` 컬럼 추가
| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `region` | varchar(20) | ✅ | 시도 코드(아래 §3.3). 필터 성립을 위해 필수 |
| `image_key` | varchar(200) | 선택 | S3 비공개 키(`challenge_prize` 패턴 재활용), null=이미지 없음 |
| `intro` | varchar(500) | 선택 | 공개 소개(비회원 대상). `notice`(회원용 고정공지)와 별개 |
| `meetup_place` | varchar(60) | 선택 | 정기런 장소 자유텍스트 (예: 잠실 한강공원) |
| `meetup_days` | varchar(20) | 선택 | 정기런 요일 CSV(월=0…일=6), `training_plan.sub_t_days` 규약과 동일. 예: `1,3` |
| `meetup_time` | varchar(30) | 선택 | 정기런 시간 자유텍스트 (예: 저녁 7:30) |

- **백필**: 기존 크루는 `region` 없음 → 마이그레이션에서 `default 'ETC'`(기타)로 채우고, 리더가 설정에서 수정 유도. (`ETC`를 필터 목록 맨 뒤 "기타"로 노출)

### 3.2 `crew_join_request` (신규)
```sql
create table crew_join_request (
  id           bigserial   primary key,
  crew_id      bigint      not null references crew(id) on delete cascade,
  user_id      uuid        not null references users(id) on delete cascade,
  message      varchar(100),                 -- 신청 한마디(선택)
  status       varchar(10) not null default 'PENDING'
               check (status in ('PENDING','APPROVED','REJECTED','CANCELED')),
  reject_reason varchar(100),                -- 거절 사유(선택)
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,                  -- 승인/거부 시각
  decided_by   uuid                          -- 처리한 리더(감사)
);
-- 한 크루에 pending 중복 신청 방지(부분 유니크)
create unique index uq_join_request_pending
  on crew_join_request (crew_id, user_id) where status = 'PENDING';
-- 리더 인박스 / 신청자 내역
create index idx_join_request_crew_status on crew_join_request (crew_id, status);
create index idx_join_request_user_status on crew_join_request (user_id, status);
```
- **쿨다운**: 별도 컬럼 없이 `(crew_id, user_id)`의 최근 REJECTED `decided_at`이 24h 이내면 신청 차단.

### 3.3 지역 코드 (시도 17 + 온라인 + 기타)
`SEOUL BUSAN DAEGU INCHEON GWANGJU DAEJEON ULSAN SEJONG GYEONGGI GANGWON CHUNGBUK CHUNGNAM JEONBUK JEONNAM GYEONGBUK GYEONGNAM JEJU` + `ONLINE`(온라인/전국) + `ETC`(기타·백필용).
- 저장은 코드, 표시는 프론트 라벨맵(ko 정본). en은 로마자, ja/zh/es는 en 폴백(지역은 한국 특화라 비-ko 사용 드묾).

## 4. 신청 생명주기 (상태 머신)

```
         apply                approve
  (없음) ─────▶ PENDING ─────────────▶ APPROVED  (+CrewMember 생성, 타 pending 자동취소)
                  │  ├── reject ─────▶ REJECTED  (+reject_reason, 24h 쿨다운 시작)
                  │  └── cancel ─────▶ CANCELED  (신청자 스스로 철회)
                  └── (타 크루 가입 시 자동) ─▶ CANCELED
```

**apply 가드** (`POST /api/crews/{id}/apply`):
1. 신청자가 크루 미소속 (결정 3, 아니면 `already_in_crew`)
2. 크루 정원 미달 (결정 5, 아니면 `crew_full`)
3. 이 (crew,user) pending 없음 (부분유니크, 아니면 `already_pending`)
4. 이 (crew,user) 최근 REJECTED 24h 밖 (결정 6, 아니면 `apply_cooldown`)
5. (선택) 유저 일일 신청 상한(도배 방지, §7)
→ 통과 시 PENDING 생성 + **리더에게 푸시**(결정 1)

**approve 가드** (`POST /api/crew-join-requests/{id}/approve`, 리더):
1. 호출자 = 해당 크루 리더
2. 정원 재확인(결정 5, 승인 순간 이미 찼으면 `crew_full`)
3. 신청자 여전히 미소속(그 사이 타 크루 가입 시 → 이 요청 CANCELED 처리 + 안내)
→ CrewMember 생성 + APPROVED + **신청자의 타 크루 pending 전부 자동취소**(결정 4) + 신청자에게 승인 푸시

**reject** (리더, `{reason?}`): REJECTED + reject_reason + 신청자에게 거절 푸시(+사유) + 24h 쿨다운.
**cancel** (신청자): PENDING→CANCELED.
**자동취소**: 유저가 어떤 경로로든(승인/초대코드) 크루 가입 시, 그 유저의 다른 PENDING 전부 CANCELED.

## 5. API

| 메서드·경로 | 용도 | 인증 |
|---|---|---|
| `GET /api/crews/discover?page=&region=&query=` | 발견 목록(리치·지역필터·이름검색 통합) | 공개 |
| `GET /api/crews/{id}` | 공개 크루 상세 | 공개(로그인 시 내 신청상태 포함) |
| `POST /api/crews/{id}/apply` `{message?}` | 가입 신청 | 유저 |
| `POST /api/crew-join-requests/{id}/approve` | 승인 | 리더 |
| `POST /api/crew-join-requests/{id}/reject` `{reason?}` | 거절 | 리더 |
| `POST /api/crew-join-requests/{id}/cancel` | 신청 철회 | 신청자 |
| `GET /api/crews/me/join-requests` | 리더 인박스(내 크루 pending) | 리더 |
| `GET /api/crews/my-applications` | 내 신청 현황(pending) | 유저 |
| (확장) 크루 생성·`PATCH` 설정 | region·image·meetup·intro 필드 | 리더 |

**발견 목록 아이템(리치):** `{ id, name, region, imageUrl?, memberCount, maxMembers, meetupPlace?, meetupDays?, meetupTime? }`
**상세:** 위 + `intro?, createdAt, leaderNickname, isFull, myApplicationStatus?(PENDING|none), inCooldown?`
- **멤버 로스터는 비공개** — 인원수만 노출(프라이버시, 러닝라이프도 "N명 이상"만).
- 이미지: 크루 이미지는 공개라 게이트 없는 공개 서빙(`GET /api/crews/{id}/image` 또는 발견 응답에 URL 동봉).

## 6. 화면

### 6.1 발견 목록 (crew/page.tsx 개편)
- 상단 **지역 필터 칩**(가로 스크롤): 전체 · 서울 · 경기 · … · 제주 · 온라인 · 기타
- 이름 검색창
- **카드**: 좌측 정사각 썸네일 64px(없으면 크루명 이니셜+색 플레이스홀더) + 우측 [크루명 · 지역뱃지 · N/정원명 · 정기런 요약줄(있으면)] → 탭 시 상세
- 정렬: 기본 **인원 많은 순**(활성 크루 우선) — §7 결정
- 정기런 요약줄 예: `📍 잠실 한강공원 · 화·목 · 저녁 7:30` (없으면 줄 생략)

### 6.2 공개 크루 상세 (신규 `/crew/[id]`)
- 상단 이미지 배너(없으면 플레이스홀더) → 크루명 · 지역뱃지 · `N명`/정원
- 소개(intro), 정기런 블록(장소/요일/시간, 있는 것만), 리더 닉네임
- **CTA 분기**:
  - 미소속 + 정원미달 + pending없음 + 쿨다운아님 → **[가입 신청]**(한마디 입력 모달)
  - pending → **[신청 취소]** + "승인 대기 중"
  - 정원 마감 → **[정원 마감]** 비활성
  - 이미 다른 크루 소속 → 비활성 + "먼저 지금 크루를 나가야 해요"(결정 3)
  - 쿨다운 → 비활성 + "재신청은 24시간 후"

### 6.3 크루 설정 — 신청 관리 (리더 전용, crew/settings)
- "가입 신청 (N)" 섹션 → PENDING 목록: 신청자 닉네임 + 한마디 + **[승인] [거절]**
- 거절 시 사유 입력 모달(선택)

### 6.4 내 신청 현황 (크루 미소속 홈)
- 크루 없는 홈(만들기/초대코드 온보딩)에 "내 신청 현황" — pending 목록 + 취소 버튼. 승인은 푸시로도 통지.

## 7. 남은 미세 결정 (설계 중 발견 — 추천값 명시)

| 항목 | 추천 |
|---|---|
| 목록 정렬 | **인원 많은 순**(빈 크루가 위로 안 옴). 후속으로 "최근 활동순" 고려 |
| region 백필 sentinel | `ETC`(기타) — 필터 맨 뒤 노출, 리더가 수정 유도 |
| 멤버 로스터 공개 | **비공개**(인원수만) — 프라이버시 |
| 신청 도배 방지 | 유저 **하루 10건** 상한(가벼운 캡) |
| 이미지 검열 | 1차는 신고 없음, 부적절 이미지는 나중에 신고 기능. 지금은 리더 자율 |

## 8. 푸시 (기존 인프라 재활용)
`SystemPushHistory` + `device_token`(FCM) + 수신자 `lang_cd`·`push_enabled` 준수. 신규 타입 3개:
- `crew_apply_received` → 리더: "○○님이 크루 가입을 신청했어요"
- `crew_apply_approved` → 신청자: "△△ 크루 가입이 승인됐어요"
- `crew_apply_rejected` → 신청자: "△△ 크루 가입이 거절됐어요" (+사유 있으면 본문 포함)

## 9. 구현 순서
1. 마이그레이션 V45(crew 컬럼 + crew_join_request + 백필) + 엔티티/DTO
2. 크루 생성·설정에 region(필수)·image 업로드·meetup·intro
3. 발견 API(지역필터·리치아이템) + 목록 UI 개편
4. 공개 상세 페이지
5. 신청 엔드포인트 + 생명주기 가드(정원·쿨다운·자동취소)
6. 리더 신청관리 UI
7. 푸시 3종
8. 내 신청 현황 뷰
9. 테스트(상태머신·가드) + i18n 5개국어

## 10. 미결(구현 중 확정)
- 크루 이미지 공개 서빙 방식(공개 엔드포인트 vs 발견 응답 URL 동봉)
- `region` 백필을 `ETC` 고정 vs 최다 크루 지역 추정 — `ETC` 권장(단순)
- 승인/거절 후 요청 행 보존 기간(감사용 유지 권장)
