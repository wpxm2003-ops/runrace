package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.ForbiddenTextChars;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.common.PageParams;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewJoinRequestStatus;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewDetailResponse;
import com.runrace.backend.crew.dto.CrewInsightsResponse;
import com.runrace.backend.crew.dto.CrewJoinRequestRow;
import com.runrace.backend.crew.dto.MyApplicationRow;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewMemberRow;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewView;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.event.CrewEvents;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 크루(C0) — 생성·가입(초대 코드)·월간 보드·리더 관리.
 * 월간 보드는 별도 집계 테이블 없이 {@code workout_session}을 이번 달 시작(KST 1일) 이후로 합산한다.
 */
@Service
@RequiredArgsConstructor
public class CrewService {

  static final int MAX_MEMBERS = 300;
  static final int NAME_MIN = 2;
  static final int NAME_MAX = 20;
  static final int NOTICE_MAX = 100;
  static final int INTRO_MAX = 500;
  static final int MEETUP_PLACE_MAX = 60;
  static final int MEETUP_TIME_MAX = 30;
  static final int PROFILE_IMAGE_MAX = 4;
  static final int APPLY_MESSAGE_MAX = 100;
  static final int REJECT_REASON_MAX = 100;
  /** 거절 후 같은 크루 재신청 쿨다운. */
  static final int APPLY_COOLDOWN_HOURS = 24;
  /** 도배 방지 — 크루 무관, 최근 24시간 내 전체 신청 상한. */
  static final int APPLY_DAILY_CAP = 10;

  /** 시도 지역 코드 — 발견 목록 필터·크루 프로필의 유효값 화이트리스트. ETC=기타(백필 sentinel), ONLINE=온라인/전국. */
  static final Set<String> VALID_REGIONS = Set.of(
      "SEOUL", "BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN", "SEJONG",
      "GYEONGGI_SOUTH", "GYEONGGI_NORTH", "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM",
      "GYEONGBUK", "GYEONGNAM", "JEJU", "ONLINE", "ETC");

  /** 월간 보드 경계의 단일 기준 — 기존 운동일 집계와 동일하게 KST를 쓴다. */
  private static final ZoneId KST = KstTime.ZONE;

  /** 명예의 전당에 노출할 완결 개월 수 — 조회 하한과 표시 개수가 함께 쓰는 단일 출처. */
  private static final int HALL_OF_FAME_MONTHS = 12;
  /** 초대 코드 문자 — 혼동되는 I·L·O·0·1 제외. */
  private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  private static final int CODE_LEN = 6;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewJoinRequestRepository crewJoinRequestRepository;
  private final AppUserRepository appUserRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final CrewProfileImages crewProfileImages;
  private final ActivityHistoryService activityHistoryService;

  // ── 조회 ──────────────────────────────────────────────────────

  /** 내 크루 홈 — 크루 정보 + 월간 보드(이번 달 거리 내림차순) + 인사이트 스탯. 미소속이면 crew=null. */
  @Transactional(readOnly = true)
  public MyCrewResponse myCrew(UUID meId) {
    Optional<CrewMember> membership = crewMemberRepository.findByUserId(meId);
    if (membership.isEmpty()) {
      return new MyCrewResponse(null);
    }
    Crew crew = membership.get().getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());

    // 이번 달 멤버별 누적
    Map<UUID, long[]> agg = sumMonthDistanceByMember(crew.getId(), monthStartKst());

    long allTime = crewMemberRepository.sumMemberDistanceSinceJoin(crew.getId());

    List<CrewMemberRow> rows = toBoardRows(crew, members, agg, meId);

    return new MyCrewResponse(new CrewView(
        crew.getId(), crew.getName(), crew.getNotice(), crew.getJoinCode(),
        crew.isLeader(meId), crew.getMaxMembers(), crew.getMonthGoalKm(),
        allTime, rows));
  }

  /**
   * 이번 달 멤버별 집계 — {userId → [거리m, 횟수]}.
   * 가입 이후 기록만 집계 — 가입 전 과거 운동이 크루 보드·잔디에 새어 들어오지 않게 한다.
   */
  private Map<UUID, long[]> sumMonthDistanceByMember(Long crewId, OffsetDateTime monthStart) {
    Map<UUID, long[]> agg = new HashMap<>();
    for (var row : crewMemberRepository.sumMemberDistanceSince(crewId, monthStart)) {
      agg.put(row.getUserId(), new long[] {row.getDistanceM(), row.getRuns()});
    }
    return agg;
  }

  /** 월간 보드 행 — 멤버마다 이번 달 집계를 채우고(없으면 0) 거리순으로 세운다. */
  private static List<CrewMemberRow> toBoardRows(
      Crew crew, List<CrewMember> members, Map<UUID, long[]> agg, UUID meId) {
    return members.stream()
        .map(m -> {
          AppUser u = m.getUser();
          long[] a = agg.getOrDefault(u.getId(), new long[] {0, 0});
          return new CrewMemberRow(
              u.getId(), u.getNickname(), crew.isLeader(u.getId()), u.getId().equals(meId),
              a[0], (int) a[1]);
        })
        // 월간 거리 내림차순, 동률(0km 포함)은 가입 순 유지(stream 정렬은 stable)
        .sorted(Comparator.comparingLong(CrewMemberRow::monthDistanceM).reversed())
        .toList();
  }

  /**
   * 크루 검색(도전장 상대 선택용) — 내 크루 제외, 멤버 많은 순 상위 30개.
   * 와일드카드 문자(%·_)는 리터럴 취급을 위해 제거한다.
   */
  @Transactional(readOnly = true)
  public List<CrewRepository.CrewSearchRow> search(UUID meId, String rawQuery) {
    String query = rawQuery == null ? "" : rawQuery.trim().replaceAll("[%_]", "");
    long excludeCrewId = crewMemberRepository.findByUserId(meId)
        .map(m -> m.getCrew().getId())
        .orElse(-1L);
    return crewRepository.searchByName(query, excludeCrewId);
  }

  /**
   * 크루 발견 목록 — 10개 단위, 지역 필터(null/빈 문자열=전체), 멤버 수 내림차순.
   * regionCode가 유효 목록 밖이면 결과가 항상 비게 되므로("전체"로 폴백하지 않음)
   * 사전에 화이트리스트를 검증해 조용한 오타를 막는다.
   */
  @Transactional(readOnly = true)
  public List<CrewRepository.CrewDiscoveryRow> discover(String regionCode, int page, int size) {
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    int safePage = clamped.page();
    int safeSize = clamped.size();
    String region = regionCode == null ? "" : regionCode.trim().toUpperCase();
    if (!region.isEmpty() && !VALID_REGIONS.contains(region)) {
      throw ApiException.badRequest("invalid_region");
    }
    return crewRepository.findDiscoverableRich(region, safeSize + 1, (long) safePage * safeSize);
  }

  /**
   * 공개 크루 상세 — 비회원도 조회 가능. viewerId가 있으면 재신청 쿨다운 여부를 함께 채운다.
   * 대기중 신청 여부는 담지 않는다 — {@link CrewDetailResponse} 참조.
   */
  @Transactional(readOnly = true)
  public CrewDetailResponse detail(long crewId, UUID viewerId) {
    Crew crew = crewRepository.getRequired(crewId);
    int memberCount = crewMemberRepository.countByCrewId(crewId);

    boolean inCooldown = viewerId != null && isInCooldown(crewId, viewerId);

    return new CrewDetailResponse(
        crew.getId(), crew.getName(), crew.getRegion(), crew.getImageUrl(),
        crewProfileImages.from(crew, PROFILE_IMAGE_MAX), crew.getIntro(),
        memberCount, crew.getMaxMembers(),
        crew.getMeetupPlace(), parseMeetupDaysCsv(crew.getMeetupDays()), crew.getMeetupTime(),
        crew.getCreatedAt(), crew.getFoundedAt(), crew.getLeader().getNickname(),
        memberCount >= crew.getMaxMembers(), inCooldown);
  }

  /** 크루 잔디(최근 5주 날짜별 뛴 멤버 수) + 명예의 전당(월별 MVP). */
  @Transactional(readOnly = true)
  public CrewInsightsResponse insights(UUID meId) {
    CrewMember membership = requireMembership(meId);
    Crew crew = membership.getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());
    OffsetDateTime heatmapFrom = monthStartKst();

    List<CrewInsightsResponse.DayCell> heatmap = buildHeatmap(crew.getId(), members, heatmapFrom);
    // 이번 달(진행 중)은 어차피 제외하므로, 이번 달 1일에서 노출 개월 수만큼 거슬러 올라가면
    // 완결된 달이 정확히 HALL_OF_FAME_MONTHS개 들어온다.
    List<CrewInsightsResponse.HallEntry> hallOfFame =
        buildHallOfFame(crew.getId(), members, heatmapFrom.minusMonths(HALL_OF_FAME_MONTHS));

    return new CrewInsightsResponse(
        heatmapFrom.atZoneSameInstant(KST).toLocalDate().toString(),
        members.size(), heatmap, hallOfFame);
  }

  /**
   * 잔디 — 이번 달(캘린더 월 1일 시작). 날짜별 뛴 멤버 닉네임(가입 순, 최대 10명).
   * 달마다 실제 날짜 수·시작 요일이 달라 매달 그리드 모양이 자연히 달라진다(고정 윈도우가 아님).
   */
  private List<CrewInsightsResponse.DayCell> buildHeatmap(
      Long crewId, List<CrewMember> members, OffsetDateTime heatmapFrom) {
    Map<LocalDate, Set<UUID>> runnersByDay = new HashMap<>();
    for (var row : crewMemberRepository.findDailyRunners(crewId, heatmapFrom)) {
      runnersByDay.computeIfAbsent(row.getDay(), k -> new HashSet<>()).add(row.getUserId());
    }
    return runnersByDay.entrySet().stream()
        .map(e -> {
          List<String> names = members.stream()
              .filter(m -> e.getValue().contains(m.getUser().getId()))
              .map(m -> m.getUser().getNickname())
              .filter(Objects::nonNull)
              .limit(10)
              .toList();
          return new CrewInsightsResponse.DayCell(e.getKey().toString(), e.getValue().size(), names);
        })
        .toList();
  }

  /**
   * 명예의 전당 — 월별 최다 거리 멤버. 진행 중인 이번 달은 제외, 최신월 우선 최대
   * {@value #HALL_OF_FAME_MONTHS}개. {@code from}은 그 개월 수에서 계산된 조회 하한이라
   * 아래 limit과 같은 상수를 공유해야 한다(한쪽만 바꾸면 개수가 어긋난다).
   */
  private List<CrewInsightsResponse.HallEntry> buildHallOfFame(
      Long crewId, List<CrewMember> members, OffsetDateTime from) {
    Map<UUID, String> nicknames = new HashMap<>();
    for (CrewMember m : members) {
      nicknames.put(m.getUser().getId(), m.getUser().getNickname());
    }

    String currentYm = LocalDate.now(KST).toString().substring(0, 7);
    Map<String, CrewInsightsResponse.HallEntry> bestByMonth = new HashMap<>();
    for (var row : crewMemberRepository.aggregateMonthlyMemberDistance(crewId, from)) {
      if (row.getYm().compareTo(currentYm) >= 0) {
        continue;
      }
      CrewInsightsResponse.HallEntry cur = bestByMonth.get(row.getYm());
      if (cur == null || row.getDistanceM() > cur.distanceM()) {
        bestByMonth.put(row.getYm(), new CrewInsightsResponse.HallEntry(
            row.getYm(), nicknames.get(row.getUserId()), row.getDistanceM()));
      }
    }
    return bestByMonth.values().stream()
        .sorted(Comparator.comparing(CrewInsightsResponse.HallEntry::month).reversed())
        .limit(HALL_OF_FAME_MONTHS)
        .toList();
  }

  // ── 생성·가입·탈퇴 ────────────────────────────────────────────

  /** 크루 생성 — 생성자가 리더가 되고 멤버로도 들어간다(1인 1크루). 지역은 발견 필터의 기준이라 필수. */
  @Transactional
  public void create(UUID meId, String rawName, String rawRegion) {
    String name = validateName(rawName);
    String region = validateRegion(rawRegion);
    AppUser me = appUserRepository.getRequiredForUpdate(meId);
    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewRepository.existsByName(name)) {
      throw ApiException.conflict("crew_name_taken");
    }
    OffsetDateTime now = OffsetDateTime.now();
    Crew crew = crewRepository.save(Crew.builder()
        .name(name)
        .joinCode(generateJoinCode())
        .leader(me)
        .maxMembers(MAX_MEMBERS)
        .region(region)
        .createdAt(now)
        .build());
    crewMemberRepository.save(CrewMember.builder().crew(crew).user(me).joinedAt(now).build());
    cancelOtherPendingApplications(meId);
    activityHistoryService.recordSelf(
        meId, ActivityAction.CREW_CREATED, ActivityTargetType.CREW, crew.getId());
  }

  /** 초대 코드로 가입. */
  @Transactional
  public void join(UUID meId, String rawCode) {
    Long crewId = findByCode(rawCode).getId();
    AppUser me = appUserRepository.getRequiredForUpdate(meId);
    Crew crew = lockCrew(crewId);
    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crew.getId()) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
    crewMemberRepository.save(
        CrewMember.builder().crew(crew).user(me).joinedAt(OffsetDateTime.now()).build());
    // 초대코드 즉시가입도 "가입"이므로 발견 경로로 넣어둔 다른 신청은 전부 정리한다.
    cancelOtherPendingApplications(meId);
    activityHistoryService.recordSelf(
        meId,
        ActivityAction.CREW_JOINED,
        ActivityTargetType.CREW,
        crew.getId(),
        Map.of("method", "invite_code"));
  }

  /** 크루 탈퇴 — 리더는 탈퇴 대신 해체만 가능하다(리더 공백 방지). */
  @Transactional
  public void leave(UUID meId) {
    CrewMember membership = requireMembership(meId);
    if (membership.getCrew().isLeader(meId)) {
      throw ApiException.badRequest("leader_cannot_leave");
    }
    crewMemberRepository.delete(membership);
    activityHistoryService.recordSelf(
        meId, ActivityAction.CREW_LEFT, ActivityTargetType.CREW, membership.getCrew().getId());
  }

  // ── 리더 관리 ─────────────────────────────────────────────────

  /** 이름·공지·월간 목표 수정(리더 전용). */
  @Transactional
  public void update(UUID meId, long crewId, String rawNotice, BigDecimal monthGoalKm) {
    Crew crew = requireLeader(meId, crewId);
    String notice = validateNotice(rawNotice);
    crew.updateInfo(notice, validateMonthGoal(monthGoalKm));
    crewRepository.save(crew);
  }

  /**
   * 발견 프로필 수정(리더 전용) — 지역·이미지·소개·정기런·창설일. 전부 선택(지역 제외)이라 null이면 그 필드는 비운다.
   * meetupDays는 요일 인덱스 배열(월=0…일=6, 0~7개, 중복·범위밖 무시) → CSV로 정규화.
   */
  @Transactional
  public void updateProfile(
      UUID meId, long crewId, String rawRegion, String rawImageUrl, List<String> rawImageUrls, String rawIntro,
      String rawMeetupPlace, int[] meetupDays, String rawMeetupTime, LocalDate rawFoundedAt) {
    Crew crew = requireLeader(meId, crewId);
    String region = validateRegion(rawRegion);
    List<String> imageUrls = crewProfileImages.validate(rawImageUrls, rawImageUrl, PROFILE_IMAGE_MAX);
    String imageUrl = imageUrls.isEmpty() ? null : imageUrls.get(0);
    String imageUrlsJson = crewProfileImages.toJson(imageUrls);
    String intro = validateBoundedText(rawIntro, INTRO_MAX, "invalid_intro");
    String meetupPlace = validateBoundedText(rawMeetupPlace, MEETUP_PLACE_MAX, "invalid_meetup_place");
    String meetupTime = validateBoundedText(rawMeetupTime, MEETUP_TIME_MAX, "invalid_meetup_time");
    String meetupDaysCsv = normalizeMeetupDays(meetupDays);
    LocalDate foundedAt = validateFoundedAt(rawFoundedAt);

    List<String> previousImageUrls = crewProfileImages.from(crew, PROFILE_IMAGE_MAX);
    crew.updateProfile(region, imageUrl, imageUrlsJson, intro, meetupPlace, meetupDaysCsv, meetupTime, foundedAt);
    crewRepository.save(crew);

    for (String previous : previousImageUrls) {
      if (!imageUrls.contains(previous)) {
        eventPublisher.publishEvent(new CrewEvents.CrewImageReplacedEvent(previous));
      }
    }
  }

  /** 크루 해체(리더 전용) — 멤버십은 FK cascade로 함께 삭제된다. */
  @Transactional
  public void disband(UUID meId, long crewId) {
    Crew crew = requireLeader(meId, crewId);
    crewRepository.delete(crew);
    activityHistoryService.recordSelf(
        meId, ActivityAction.CREW_DISBANDED, ActivityTargetType.CREW, crewId);
  }

  /** 멤버 내보내기(리더 전용). 자기 자신은 내보낼 수 없다(해체·탈퇴 경로 사용). */
  @Transactional
  public void kick(UUID meId, long crewId, UUID targetUserId) {
    requireLeader(meId, crewId);
    if (meId.equals(targetUserId)) {
      throw ApiException.badRequest("cannot_kick_self");
    }
    CrewMember target = crewMemberRepository.findByCrewIdAndUserId(crewId, targetUserId)
        .orElseThrow(() -> ApiException.notFound("member_not_found"));
    crewMemberRepository.delete(target);
    activityHistoryService.record(
        meId,
        targetUserId,
        ActivityAction.CREW_MEMBER_REMOVED,
        ActivityTargetType.CREW,
        crewId,
        Map.of());
  }

  // ── 가입신청(승인제) ──────────────────────────────────────────

  /**
   * 발견 목록에서 가입 신청 — 초대코드 즉시가입과 별개 경로. 순서대로 가드:
   * 미소속 → 정원 여유 → 중복 pending 없음 → 24h 쿨다운 밖 → 도배 상한 이내.
   */
  @Transactional
  public void apply(UUID meId, long crewId, String rawMessage) {
    Crew crew = crewRepository.getRequired(crewId);
    String message = validateBoundedText(rawMessage, APPLY_MESSAGE_MAX, "invalid_apply_message");
    AppUser applicant = appUserRepository.getRequiredForUpdate(meId);

    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crewId) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
    if (crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
        crewId, meId, CrewJoinRequestStatus.PENDING)) {
      throw ApiException.conflict("already_pending");
    }
    if (isInCooldown(crewId, meId)) {
      throw ApiException.conflict("apply_cooldown");
    }
    OffsetDateTime dailyWindowStart = OffsetDateTime.now().minusHours(24);
    if (crewJoinRequestRepository.countByUserIdAndCreatedAtAfter(meId, dailyWindowStart) >= APPLY_DAILY_CAP) {
      throw ApiException.conflict("apply_rate_limited");
    }

    CrewJoinRequest request = CrewJoinRequest.of(crew, applicant, message);
    crewJoinRequestRepository.save(request);
    activityHistoryService.recordSelf(
        meId,
        ActivityAction.CREW_APPLICATION_SUBMITTED,
        ActivityTargetType.CREW_APPLICATION,
        request.getId(),
        Map.of("crewId", crewId));
    eventPublisher.publishEvent(new CrewEvents.CrewApplyReceived(
        crew.getLeader().getId(), applicant.getNickname(), crewId));
  }

  /**
   * 가입 신청 승인(리더 전용) — 승인 순간 정원·소속 상태를 재확인한다(신청 이후 상황이 바뀔 수 있음).
   * 승인되면 신청자의 다른 대기중 신청은 전부 자동취소된다(1인 1크루 전제와 정합).
   *
   * <p>{@code noRollbackFor}인 이유: 신청자가 이미 다른 크루에 들어간 경우
   * {@link #requireApplicantStillJoinable}가 그 신청을 취소해 두고 conflict를 던지는데,
   * 기본 설정이면 {@code ApiException}(RuntimeException)에 롤백돼 그 취소가 사라진다.
   * 그러면 프론트는 "자동으로 취소됐어요"라고 안내하는데 신청은 계속 대기중으로 남는다.
   * 이 메서드에서 예외 전에 일어나는 쓰기는 그 의도된 취소뿐이라 커밋해도 안전하다.
   */
  @Transactional(noRollbackFor = ApiException.class)
  public void approve(UUID leaderId, long requestId) {
    // 멤버십을 만드는 모든 경로가 신청자 행을 첫 잠금으로 사용한다. 그러면 pending ID를
    // 읽은 뒤 새 신청·즉시가입·크루생성이 끼어들 수 없고, user -> crew -> request 순서가
    // 모든 경로에서 동일해진다.
    UUID applicantId = crewJoinRequestRepository.findApplicantUserId(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    Long crewId = crewJoinRequestRepository.findCrewId(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    AppUser applicant = appUserRepository.getRequiredForUpdate(applicantId);
    Crew crew = lockCrew(crewId);

    List<CrewJoinRequest> locked =
        crewJoinRequestRepository.findAllByIdsForUpdate(lockIdsForApplicant(requestId, applicantId));
    CrewJoinRequest request = locked.stream()
        .filter(r -> r.getId() == requestId)
        .findFirst()
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    validateLeaderPending(request, leaderId);

    requireApplicantStillJoinable(request, crew, applicantId);

    // 가입 확정 — 멤버 등록 → 신청 승인 → 신청자의 다른 대기중 신청 정리
    crewMemberRepository.save(
        CrewMember.builder().crew(crew).user(applicant).joinedAt(OffsetDateTime.now()).build());
    request.approve(leaderId);
    crewJoinRequestRepository.save(request);
    cancelAlreadyLocked(locked, requestId);

    activityHistoryService.record(
        leaderId,
        applicantId,
        ActivityAction.CREW_APPLICATION_APPROVED,
        ActivityTargetType.CREW_APPLICATION,
        requestId,
        Map.of("crewId", crewId));
    activityHistoryService.record(
        leaderId,
        applicantId,
        ActivityAction.CREW_JOINED,
        ActivityTargetType.CREW,
        crewId,
        Map.of("method", "application", "requestId", requestId));

    eventPublisher.publishEvent(
        new CrewEvents.CrewApplyApproved(applicantId, crew.getName(), crew.getId()));
  }

  /** requestId 자신 + 같은 신청자의 대기중 신청 id 전체(정렬) — approve()의 일괄 잠금 대상. */
  private List<Long> lockIdsForApplicant(long requestId, UUID applicantId) {
    TreeSet<Long> ids = new TreeSet<>(crewJoinRequestRepository.findPendingIdsByUserId(applicantId));
    ids.add(requestId);
    return List.copyOf(ids);
  }

  /** 이미 잠가 둔 목록에서 대상 자신을 제외하고, 여전히 대기중인 것만 취소한다(자동취소). */
  private void cancelAlreadyLocked(List<CrewJoinRequest> locked, long exceptRequestId) {
    for (CrewJoinRequest pending : locked) {
      if (pending.getId() == exceptRequestId || !pending.isPending()) continue;
      pending.cancel();
      crewJoinRequestRepository.save(pending);
    }
  }

  /**
   * 신청 행 단건 잠금 조회 — 승인·거절·철회가 같은 신청을 동시에 결정할 때
   * 뒤 트랜잭션이 앞 결정을 stale 상태로 덮어쓰지 않게 한다.
   */
  private CrewJoinRequest lockRequest(long requestId) {
    return crewJoinRequestRepository.findAllByIdsForUpdate(List.of(requestId))
        .stream().findFirst()
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
  }

  /** 승인·거절 공통 가드 — 신청 존재 + 내가 그 크루의 리더 + 아직 대기중. */
  private CrewJoinRequest requirePendingRequestAsLeader(UUID leaderId, long requestId) {
    CrewJoinRequest request = lockRequest(requestId);
    validateLeaderPending(request, leaderId);
    return request;
  }

  private static void validateLeaderPending(CrewJoinRequest request, UUID leaderId) {
    if (!request.getCrew().isLeader(leaderId)) {
      throw ApiException.forbidden("not_leader");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
  }

  /** 승인 순간의 재확인 — 신청자 소속·정원 상태는 신청 이후 바뀔 수 있다. */
  private void requireApplicantStillJoinable(CrewJoinRequest request, Crew crew, UUID applicantId) {
    // 신청 이후 다른 경로(초대코드 등)로 이미 크루에 들어갔으면 이 신청은 더 이상 유효하지 않다.
    if (crewMemberRepository.existsByUserId(applicantId)) {
      request.cancel();
      crewJoinRequestRepository.save(request);
      throw ApiException.conflict("applicant_already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crew.getId()) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
  }

  /** 가입 신청 거절(리더 전용) — 사유는 선택. 거절 시각부터 {@value #APPLY_COOLDOWN_HOURS}h 재신청 쿨다운. */
  @Transactional
  public void reject(UUID leaderId, long requestId, String rawReason) {
    CrewJoinRequest request = requirePendingRequestAsLeader(leaderId, requestId);
    Crew crew = request.getCrew();
    String reason = validateBoundedText(rawReason, REJECT_REASON_MAX, "invalid_reject_reason");

    request.reject(leaderId, reason);
    crewJoinRequestRepository.save(request);

    activityHistoryService.record(
        leaderId,
        request.getUser().getId(),
        ActivityAction.CREW_APPLICATION_REJECTED,
        ActivityTargetType.CREW_APPLICATION,
        requestId,
        Map.of("crewId", crew.getId()));

    eventPublisher.publishEvent(new CrewEvents.CrewApplyRejected(
        request.getUser().getId(), crew.getName(), reason, crew.getId()));
  }

  /** 신청 철회(신청자 본인). */
  @Transactional
  public void cancelApplication(UUID meId, long requestId) {
    CrewJoinRequest request = lockRequest(requestId);
    if (!request.getUser().getId().equals(meId)) {
      throw ApiException.forbidden("not_your_request");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
    request.cancel();
    crewJoinRequestRepository.save(request);
    activityHistoryService.recordSelf(
        meId,
        ActivityAction.CREW_APPLICATION_CANCELLED,
        ActivityTargetType.CREW_APPLICATION,
        requestId,
        Map.of("crewId", request.getCrew().getId()));
  }

  /** 내 신청 현황(대기중 전체) — 크루 미소속 홈에서 노출. */
  @Transactional(readOnly = true)
  public List<MyApplicationRow> myApplications(UUID meId) {
    return crewJoinRequestRepository.findPendingByUserId(meId).stream()
        .map(r -> new MyApplicationRow(
            r.getId(), r.getCrew().getId(), r.getCrew().getName(), r.getCreatedAt()))
        .toList();
  }

  /** 리더 인박스 — 내 크루(사용자당 1개)의 대기중 신청 전체(먼저 온 순). 리더가 아니면 forbidden. */
  @Transactional(readOnly = true)
  public List<CrewJoinRequestRow> leaderInbox(UUID meId) {
    CrewMember membership = requireMembership(meId);
    if (!membership.getCrew().isLeader(meId)) {
      throw ApiException.forbidden("not_leader");
    }
    return crewJoinRequestRepository.findPendingByCrewId(membership.getCrew().getId()).stream()
        .map(r -> new CrewJoinRequestRow(
            r.getId(), r.getUser().getId(), r.getUser().getNickname(), r.getMessage(), r.getCreatedAt()))
        .toList();
  }

  // ── 계정 탈퇴 연동 ────────────────────────────────────────────

  /**
   * 계정 탈퇴(익명화) 시 크루 멤버십 정리 — 대인 데이터 삭제 원칙과 동일 선상.
   * 리더면 가장 오래된 다른 멤버에게 승계하고, 혼자면 크루를 삭제한다.
   */
  @Transactional
  public void removeMembershipForWithdrawal(UUID userId) {
    Optional<CrewMember> membership = crewMemberRepository.findByUserId(userId);
    if (membership.isEmpty()) {
      return;
    }
    Crew crew = membership.get().getCrew();
    if (crew.isLeader(userId)) {
      Optional<CrewMember> successor =
          crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId()).stream()
              .filter(m -> !m.getUser().getId().equals(userId))
              .findFirst();
      if (successor.isEmpty()) {
        crewRepository.delete(crew); // cascade로 내 멤버십도 삭제
        activityHistoryService.recordSelf(
            userId, ActivityAction.CREW_DISBANDED, ActivityTargetType.CREW, crew.getId());
        return;
      }
      crew.transferLeader(successor.get().getUser());
      crewRepository.save(crew);
      activityHistoryService.record(
          userId,
          successor.get().getUser().getId(),
          ActivityAction.CREW_LEADER_CHANGED,
          ActivityTargetType.CREW,
          crew.getId(),
          Map.of("previousLeaderUserId", userId.toString()));
    }
    crewMemberRepository.delete(membership.get());
    activityHistoryService.recordSelf(
        userId, ActivityAction.CREW_LEFT, ActivityTargetType.CREW, crew.getId());
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────

  /** 이번 달 시작(KST 1일 00:00). 크루 보드·잔디 집계의 하한 경계. */
  private static OffsetDateTime monthStartKst() {
    LocalDate firstOfMonth = LocalDate.now(KST).withDayOfMonth(1);
    return firstOfMonth.atStartOfDay(KST).toOffsetDateTime();
  }

  private Crew findByCode(String rawCode) {
    String code = rawCode == null ? "" : rawCode.trim().toUpperCase();
    if (code.isEmpty()) {
      throw ApiException.notFound("crew_not_found");
    }
    return crewRepository.findByJoinCode(code)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
  }

  private Crew lockCrew(Long crewId) {
    List<Crew> crews = crewRepository.findAllByIdsForUpdate(List.of(crewId));
    if (crews.size() != 1) {
      throw ApiException.notFound("crew_not_found");
    }
    return crews.get(0);
  }

  private CrewMember requireMembership(UUID meId) {
    return CrewGuards.requireMembership(crewMemberRepository, meId);
  }

  private Crew requireLeader(UUID meId, long crewId) {
    Crew crew = crewRepository.getRequired(crewId);
    if (!crew.isLeader(meId)) {
      throw ApiException.forbidden("not_leader");
    }
    return crew;
  }

  private static String validateName(String raw) {
    String name = raw == null ? "" : raw.trim();
    if (name.length() < NAME_MIN || name.length() > NAME_MAX || containsForbiddenChar(name)) {
      throw ApiException.badRequest("invalid_crew_name");
    }
    return name;
  }

  private static String validateNotice(String raw) {
    return validateBoundedText(raw, NOTICE_MAX, "invalid_notice");
  }

  /**
   * 공통 선택 텍스트 검증 — trim 후 빈 문자열은 null(미입력)로, 길이·금지문자 위반은 400.
   * notice·intro·meetup 필드·신청 한마디·거절 사유가 전부 이 형태(선택, 짧은 자유텍스트)라 공유한다.
   */
  private static String validateBoundedText(String raw, int maxLen, String errorCode) {
    if (raw == null) {
      return null;
    }
    String text = raw.trim();
    if (text.isEmpty()) {
      return null;
    }
    if (text.length() > maxLen || containsForbiddenChar(text)) {
      throw ApiException.badRequest(errorCode);
    }
    return text;
  }

  /** 창설일 검증 — 선택값(null=미입력, createdAt으로 대체 표시). 미래 날짜만 막는다. */
  private LocalDate validateFoundedAt(LocalDate raw) {
    if (raw == null) {
      return null;
    }
    if (raw.isAfter(LocalDate.now(KST))) {
      throw ApiException.badRequest("invalid_founded_at");
    }
    return raw;
  }

  /** 지역 코드 검증 — 생성·프로필수정 둘 다 필수(빈 값 불허, updateProfile도 항상 유효 지역을 유지). */
  private static String validateRegion(String raw) {
    String region = raw == null ? "" : raw.trim().toUpperCase();
    if (!VALID_REGIONS.contains(region)) {
      throw ApiException.badRequest("invalid_region");
    }
    return region;
  }

  /** CSV(월=0…일=6) → 요일 배열. null/빈 값은 빈 배열(정기런 없음). */
  private static int[] parseMeetupDaysCsv(String csv) {
    if (csv == null || csv.isBlank()) {
      return new int[0];
    }
    return Arrays.stream(csv.split(",")).mapToInt(Integer::parseInt).toArray();
  }

  /** 요일 배열(월=0…일=6) → CSV. 중복 제거·정렬·범위밖 무시. 빈 배열/전부 범위밖이면 null(미입력). */
  private static String normalizeMeetupDays(int[] days) {
    if (days == null || days.length == 0) {
      return null;
    }
    int[] cleaned = Arrays.stream(days).filter(d -> d >= 0 && d <= 6).distinct().sorted().toArray();
    if (cleaned.length == 0) {
      return null;
    }
    return Arrays.stream(cleaned).mapToObj(Integer::toString)
        .reduce((a, b) -> a + "," + b).orElse(null);
  }

  /** 거절 후 재신청 쿨다운 — 가장 최근 거절 시각으로부터 {@value #APPLY_COOLDOWN_HOURS}시간 이내인지. */
  private boolean isInCooldown(long crewId, UUID userId) {
    return crewJoinRequestRepository.findLastRejectedAt(crewId, userId)
        .map(last -> last.isAfter(OffsetDateTime.now().minusHours(APPLY_COOLDOWN_HOURS)))
        .orElse(false);
  }

  /**
   * 초대코드 즉시가입·직접생성으로 크루에 들어간 유저의 대기중 신청을 전부 취소한다.
   * (승인 경로는 {@link #cancelAlreadyLocked}가 approve()의 일괄 잠금 안에서 처리한다.)
   */
  private void cancelOtherPendingApplications(UUID userId) {
    // 잠금 없이 조회 후 쓰면, 다른 리더가 같은 신청자의 다른 신청을 동시에 결정할 때 그
    // 결정을 stale 상태로 덮어쓸 수 있다 — 정렬된 순서로 잠근 뒤(교착 방지) 처리한다.
    List<Long> ids = crewJoinRequestRepository.findPendingIdsByUserId(userId).stream()
        .sorted()
        .toList();
    if (ids.isEmpty()) return;
    for (CrewJoinRequest pending : crewJoinRequestRepository.findAllByIdsForUpdate(ids)) {
      if (!pending.isPending()) continue; // 잠그는 사이 이미 결정됐으면 건너뜀
      pending.cancel();
      crewJoinRequestRepository.save(pending);
    }
  }

  /** 월간 목표 검증 — null(목표 없음) 또는 1~9,999km. */
  private static BigDecimal validateMonthGoal(BigDecimal monthGoalKm) {
    if (monthGoalKm == null) {
      return null;
    }
    if (monthGoalKm.compareTo(BigDecimal.ONE) < 0
        || monthGoalKm.compareTo(BigDecimal.valueOf(9999)) > 0) {
      throw ApiException.badRequest("invalid_month_goal");
    }
    return monthGoalKm;
  }

  private static boolean containsForbiddenChar(String value) {
    return ForbiddenTextChars.containsForbidden(value);
  }

  /** 고유 초대 코드 생성 — 31^6(≈9억) 공간이라 충돌은 사실상 없지만 방어적으로 재시도한다. */
  private String generateJoinCode() {
    for (int attempt = 0; attempt < 10; attempt++) {
      StringBuilder sb = new StringBuilder(CODE_LEN);
      for (int i = 0; i < CODE_LEN; i++) {
        sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
      }
      String code = sb.toString();
      if (!crewRepository.existsByJoinCode(code)) {
        return code;
      }
    }
    throw ApiException.internal("join_code_generation_failed");
  }
}
