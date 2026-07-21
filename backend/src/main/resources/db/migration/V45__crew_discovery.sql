-- 크루 발견 리치화 + 가입신청(승인제). docs/crew-discovery-design.md 참고.

-- ── crew 컬럼 추가 ──────────────────────────────────────────────────
alter table crew add column region varchar(20) not null default 'ETC';
-- 기존 크루는 지역 미상 → 'ETC'(기타)로 백필. 리더가 설정에서 수정 유도(default는 신규부터 제거하지 않음 —
-- 프론트가 항상 명시 전송하므로 문제없고, 백필 sentinel 재사용을 위해 유지).
alter table crew add column image_url text;
alter table crew add column intro varchar(500);
alter table crew add column meetup_place varchar(60);
-- 정기런 요일 CSV(월=0…일=6) — training_plan.sub_t_days와 동일 규약.
alter table crew add column meetup_days varchar(20);
alter table crew add column meetup_time varchar(30);

comment on column crew.region is '시도 지역 코드(SEOUL/BUSAN/.../ONLINE/ETC). 발견 목록 필터 기준, 필수.';
comment on column crew.image_url is '대표 이미지 URL(공개, /api/uploads/image 발급). 없으면 null.';
comment on column crew.intro is '공개 소개(비회원 대상). notice(회원용 고정공지)와 별개.';
comment on column crew.meetup_place is '정기런 장소 자유텍스트(선택). 예: 잠실 한강공원.';
comment on column crew.meetup_days is '정기런 요일 CSV(월=0…일=6, 선택). 예: 1,3.';
comment on column crew.meetup_time is '정기런 시간 자유텍스트(선택). 예: 저녁 7:30.';

-- ── crew_join_request (신규) ────────────────────────────────────────
create table crew_join_request (
  id            bigserial   primary key,
  crew_id       bigint      not null references crew(id) on delete cascade,
  user_id       uuid        not null references app_user(id) on delete cascade,
  message       varchar(100),
  status        varchar(10) not null default 'PENDING'
                check (status in ('PENDING','APPROVED','REJECTED','CANCELED')),
  reject_reason varchar(100),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);

-- 한 크루에 동시 PENDING 신청 1건만(부분 유니크) — 중복 신청 방지의 DB 레벨 방어선.
create unique index uq_join_request_pending
  on crew_join_request (crew_id, user_id) where status = 'PENDING';

-- 리더 인박스(크루의 대기중 신청) 조회 가속.
create index idx_join_request_crew_status on crew_join_request (crew_id, status);
-- 내 신청 현황 + 24h 쿨다운 체크(최근 REJECTED) 조회 가속.
create index idx_join_request_user_status on crew_join_request (user_id, status, decided_at desc);

comment on table crew_join_request is '크루 가입신청 — 발견 목록에서 신청 후 리더 승인/거부. 초대코드 즉시가입과 별개 경로.';
comment on column crew_join_request.crew_id is '신청 대상 크루 FK.';
comment on column crew_join_request.user_id is '신청자 app_user FK.';
comment on column crew_join_request.message is '신청 한마디(선택) — 리더의 승인 판단 근거.';
comment on column crew_join_request.status is 'PENDING/APPROVED/REJECTED/CANCELED.';
comment on column crew_join_request.reject_reason is '거절 사유(선택) — 신청자에게 푸시로 전달.';
comment on column crew_join_request.created_at is '신청 시각.';
comment on column crew_join_request.decided_at is '승인/거부/취소 확정 시각.';
comment on column crew_join_request.decided_by is '처리한 리더 app_user id(감사용, 취소는 null).';
