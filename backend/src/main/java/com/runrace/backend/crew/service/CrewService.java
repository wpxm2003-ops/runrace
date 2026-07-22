package com.runrace.backend.crew.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.runrace.backend.crew.dto.CrewRecapResponse;
import com.runrace.backend.crew.dto.MyApplicationRow;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewMemberRow;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewView;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.event.CrewEvents;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.time.DayOfWeek;
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
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 크루(C0) — 생성·가입(초대 코드)·주간 보드·리더 관리.
 * 주간 보드는 별도 집계 테이블 없이 {@code workout_session}을 주 시작(KST 월요일) 이후로 합산한다.
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
      "GYEONGGI", "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM",
      "GYEONGBUK", "GYEONGNAM", "JEJU", "ONLINE", "ETC");

  /** 주간 보드 경계의 단일 기준 — 기존 운동일 집계와 동일하게 KST를 쓴다. */
  private static final ZoneId KST = KstTime.ZONE;
  /** 초대 코드 문자 — 혼동되는 I·L·O·0·1 제외. */
  private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  private static final int CODE_LEN = 6;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewJoinRequestRepository crewJoinRequestRepository;
  private final AppUserRepository appUserRepository;
  private final ImageUploadService imageUploadService;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;

  // ── 조회 ──────────────────────────────────────────────────────

  /** 내 크루 홈 — 크루 정보 + 주간 보드(이번 주 거리 내림차순) + 인사이트 스탯. 미소속이면 crew=null. */
  @Transactional(readOnly = true)
  public MyCrewResponse myCrew(UUID meId) {
    Optional<CrewMember> membership = crewMemberRepository.findByUserId(meId);
    if (membership.isEmpty()) {
      return new MyCrewResponse(null);
    }
    Crew crew = membership.get().getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());

    OffsetDateTime now = OffsetDateTime.now();
    OffsetDateTime weekStart = weekStartKst();
    Map<UUID, long[]> agg = new HashMap<>();
    // 가입 이후 기록만 집계 — 가입 전 과거 운동이 크루 보드·잔디에 새어 들어오지 않게 한다.
    for (var row : crewMemberRepository.sumMemberDistanceSince(crew.getId(), weekStart)) {
      agg.put(row.getUserId(), new long[] {row.getDistanceM(), row.getRuns()});
    }

    // 지난주 같은 경과 시점까지의 크루 합계 — "지난주 이맘때 대비"의 공정 비교 기준.
    OffsetDateTime lastWeekStart = weekStart.minusDays(7);
    OffsetDateTime lastWeekSameTime = lastWeekStart.plus(java.time.Duration.between(weekStart, now));
    long lastWeekSum = crewMemberRepository
        .sumMemberDistanceBetween(crew.getId(), lastWeekStart, lastWeekSameTime).stream()
        .mapToLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM)
        .sum();

    long allTime = crewMemberRepository.sumMemberDistanceSinceJoin(crew.getId());

    List<CrewMemberRow> rows = members.stream()
        .map(m -> {
          AppUser u = m.getUser();
          long[] a = agg.getOrDefault(u.getId(), new long[] {0, 0});
          return new CrewMemberRow(
              u.getId(), u.getNickname(), crew.isLeader(u.getId()), u.getId().equals(meId),
              a[0], (int) a[1]);
        })
        // 주간 거리 내림차순, 동률(0km 포함)은 가입 순 유지(stream 정렬은 stable)
        .sorted(Comparator.comparingLong(CrewMemberRow::weekDistanceM).reversed())
        .toList();

    return new MyCrewResponse(new CrewView(
        crew.getId(), crew.getName(), crew.getNotice(), crew.getJoinCode(),
        crew.isLeader(meId), crew.getMaxMembers(), crew.getWeekGoalKm(),
        lastWeekSum, allTime, rows));
  }

  /** 지난주(월~일 완결 주) 결산 — 홈 결산 섹션 + 공유 카드용. */
  @Transactional(readOnly = true)
  public CrewRecapResponse recap(UUID meId) {
    CrewMember membership = requireMembership(meId);
    Crew crew = membership.getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());
    Map<UUID, String> nicknamesById = new HashMap<>();
    for (CrewMember member : members) {
      nicknamesById.put(member.getUser().getId(), member.getUser().getNickname());
    }

    OffsetDateTime weekStart = weekStartKst();
    OffsetDateTime lastWeekStart = weekStart.minusDays(7);

    // 가입 이후 기록만 — 크루 창단 전 개인 기록이 결산에 섞이지 않게 한다.
    List<CrewMemberRepository.MemberDistanceAgg> aggregates = crewMemberRepository
        .sumMemberDistanceBetween(crew.getId(), lastWeekStart, weekStart);
    long total = 0;
    long runs = 0;
    for (var row : aggregates) {
      total += row.getDistanceM();
      runs += row.getRuns();
    }

    List<CrewMemberRepository.MemberDistanceAgg> ranked = aggregates.stream()
        .sorted(Comparator
            .comparingLong(CrewMemberRepository.MemberDistanceAgg::getDistanceM)
            .reversed()
            .thenComparing(row -> Objects.toString(nicknamesById.get(row.getUserId()), "")))
        .toList();
    List<CrewRecapResponse.CrewRecapLeader> leaders = new ArrayList<>();
    for (int i = 0; i < ranked.size() && i < 3; i++) {
      var row = ranked.get(i);
      leaders.add(new CrewRecapResponse.CrewRecapLeader(
          i + 1,
          nicknamesById.get(row.getUserId()),
          row.getDistanceM()));
    }
    String mvpNickname = leaders.isEmpty() ? null : leaders.get(0).nickname();
    long mvpDist = leaders.isEmpty() ? 0 : leaders.get(0).distanceM();

    LocalDate startDate = lastWeekStart.atZoneSameInstant(KST).toLocalDate();
    return new CrewRecapResponse(
        startDate.toString(), startDate.plusDays(6).toString(),
        total, (int) runs,
        ranked.size(),
        mvpNickname, mvpDist,
        leaders);
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
   * 공개 크루 상세 — 비회원도 조회 가능. viewerId가 있으면 내 신청 상태(대기중/쿨다운)를 함께 채운다.
   */
  @Transactional(readOnly = true)
  public CrewDetailResponse detail(long crewId, UUID viewerId) {
    Crew crew = crewRepository.findById(crewId)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
    int memberCount = crewMemberRepository.countByCrewId(crewId);

    String myApplicationStatus = null;
    boolean inCooldown = false;
    if (viewerId != null) {
      if (crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          crewId, viewerId, CrewJoinRequestStatus.PENDING)) {
        myApplicationStatus = "PENDING";
      }
      inCooldown = isInCooldown(crewId, viewerId);
    }

    return new CrewDetailResponse(
        crew.getId(), crew.getName(), crew.getRegion(), crew.getImageUrl(),
        profileImageUrls(crew), crew.getIntro(),
        memberCount, crew.getMaxMembers(),
        crew.getMeetupPlace(), parseMeetupDaysCsv(crew.getMeetupDays()), crew.getMeetupTime(),
        crew.getCreatedAt(), crew.getLeader().getNickname(),
        memberCount >= crew.getMaxMembers(), myApplicationStatus, inCooldown);
  }

  /** 크루 잔디(최근 5주 날짜별 뛴 멤버 수) + 명예의 전당(월별 MVP). */
  @Transactional(readOnly = true)
  public CrewInsightsResponse insights(UUID meId) {
    CrewMember membership = requireMembership(meId);
    Crew crew = membership.getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());

    Map<UUID, String> nicknames = new HashMap<>();
    for (CrewMember m : members) {
      nicknames.put(m.getUser().getId(), m.getUser().getNickname());
    }

    // 잔디 — 지난 4주 + 이번 주(월요일 시작 5줄 그리드). 날짜별 뛴 멤버 닉네임(가입 순, 최대 10명).
    OffsetDateTime heatmapFrom = weekStartKst().minusDays(28);
    Map<LocalDate, Set<UUID>> runnersByDay = new HashMap<>();
    for (var row : crewMemberRepository.findDailyRunners(crew.getId(), heatmapFrom)) {
      runnersByDay.computeIfAbsent(row.getDay(), k -> new HashSet<>()).add(row.getUserId());
    }
    List<CrewInsightsResponse.DayCell> heatmap = runnersByDay.entrySet().stream()
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

    // 명예의 전당 — 월별 최다 거리 멤버. 진행 중인 이번 달은 제외, 최신월 우선 최대 12개.
    String currentYm = LocalDate.now(KST).toString().substring(0, 7);
    Map<String, CrewInsightsResponse.HallEntry> bestByMonth = new HashMap<>();
    for (var row : crewMemberRepository.aggregateMonthlyMemberDistance(crew.getId())) {
      if (row.getYm().compareTo(currentYm) >= 0) {
        continue;
      }
      CrewInsightsResponse.HallEntry cur = bestByMonth.get(row.getYm());
      if (cur == null || row.getDistanceM() > cur.distanceM()) {
        bestByMonth.put(row.getYm(), new CrewInsightsResponse.HallEntry(
            row.getYm(), nicknames.get(row.getUserId()), row.getDistanceM()));
      }
    }
    List<CrewInsightsResponse.HallEntry> hallOfFame = bestByMonth.values().stream()
        .sorted(Comparator.comparing(CrewInsightsResponse.HallEntry::month).reversed())
        .limit(12)
        .toList();

    return new CrewInsightsResponse(
        heatmapFrom.atZoneSameInstant(KST).toLocalDate().toString(),
        members.size(), heatmap, hallOfFame);
  }

  // ── 생성·가입·탈퇴 ────────────────────────────────────────────

  /** 크루 생성 — 생성자가 리더가 되고 멤버로도 들어간다(1인 1크루). 지역은 발견 필터의 기준이라 필수. */
  @Transactional
  public void create(UUID meId, String rawName, String rawRegion) {
    String name = validateName(rawName);
    String region = validateRegion(rawRegion);
    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewRepository.existsByName(name)) {
      throw ApiException.conflict("crew_name_taken");
    }
    AppUser me = appUserRepository.getRequired(meId);
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
    cancelOtherPendingApplications(meId, null);
  }

  /** 초대 코드로 가입. */
  @Transactional
  public void join(UUID meId, String rawCode) {
    Crew crew = findByCode(rawCode);
    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crew.getId()) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
    AppUser me = appUserRepository.getRequired(meId);
    crewMemberRepository.save(
        CrewMember.builder().crew(crew).user(me).joinedAt(OffsetDateTime.now()).build());
    // 초대코드 즉시가입도 "가입"이므로 발견 경로로 넣어둔 다른 신청은 전부 정리한다.
    cancelOtherPendingApplications(meId, null);
  }

  /** 크루 탈퇴 — 리더는 탈퇴 대신 해체만 가능하다(리더 공백 방지). */
  @Transactional
  public void leave(UUID meId) {
    CrewMember membership = requireMembership(meId);
    if (membership.getCrew().isLeader(meId)) {
      throw ApiException.badRequest("leader_cannot_leave");
    }
    crewMemberRepository.delete(membership);
  }

  // ── 리더 관리 ─────────────────────────────────────────────────

  /** 이름·공지·주간 목표 수정(리더 전용). */
  @Transactional
  public void update(UUID meId, long crewId, String rawNotice, BigDecimal weekGoalKm) {
    Crew crew = requireLeader(meId, crewId);
    String notice = validateNotice(rawNotice);
    crew.updateInfo(notice, validateWeekGoal(weekGoalKm));
    crewRepository.save(crew);
  }

  /**
   * 발견 프로필 수정(리더 전용) — 지역·이미지·소개·정기런. 전부 선택(지역 제외)이라 null이면 그 필드는 비운다.
   * meetupDays는 요일 인덱스 배열(월=0…일=6, 0~7개, 중복·범위밖 무시) → CSV로 정규화.
   */
  @Transactional
  public void updateProfile(
      UUID meId, long crewId, String rawRegion, String rawImageUrl, List<String> rawImageUrls, String rawIntro,
      String rawMeetupPlace, int[] meetupDays, String rawMeetupTime) {
    Crew crew = requireLeader(meId, crewId);
    String region = validateRegion(rawRegion);
    List<String> imageUrls = validateImageUrls(rawImageUrls, rawImageUrl);
    String imageUrl = imageUrls.isEmpty() ? null : imageUrls.get(0);
    String imageUrlsJson = toImageUrlsJson(imageUrls);
    String intro = validateBoundedText(rawIntro, INTRO_MAX, "invalid_intro");
    String meetupPlace = validateBoundedText(rawMeetupPlace, MEETUP_PLACE_MAX, "invalid_meetup_place");
    String meetupTime = validateBoundedText(rawMeetupTime, MEETUP_TIME_MAX, "invalid_meetup_time");
    String meetupDaysCsv = normalizeMeetupDays(meetupDays);

    List<String> previousImageUrls = profileImageUrls(crew);
    crew.updateProfile(region, imageUrl, imageUrlsJson, intro, meetupPlace, meetupDaysCsv, meetupTime);
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
  }

  // ── 가입신청(승인제) ──────────────────────────────────────────

  /**
   * 발견 목록에서 가입 신청 — 초대코드 즉시가입과 별개 경로. 순서대로 가드:
   * 미소속 → 정원 여유 → 중복 pending 없음 → 24h 쿨다운 밖 → 도배 상한 이내.
   */
  @Transactional
  public void apply(UUID meId, long crewId, String rawMessage) {
    Crew crew = crewRepository.findById(crewId)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
    String message = validateBoundedText(rawMessage, APPLY_MESSAGE_MAX, "invalid_apply_message");

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

    AppUser applicant = appUserRepository.getRequired(meId);
    crewJoinRequestRepository.save(CrewJoinRequest.of(crew, applicant, message));
    eventPublisher.publishEvent(new CrewEvents.CrewApplyReceived(
        crew.getLeader().getId(), applicant.getNickname(), crewId));
  }

  /**
   * 가입 신청 승인(리더 전용) — 승인 순간 정원·소속 상태를 재확인한다(신청 이후 상황이 바뀔 수 있음).
   * 승인되면 신청자의 다른 대기중 신청은 전부 자동취소된다(1인 1크루 전제와 정합).
   */
  @Transactional
  public void approve(UUID leaderId, long requestId) {
    CrewJoinRequest request = crewJoinRequestRepository.findWithCrewAndUserById(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    Crew crew = request.getCrew();
    if (!crew.isLeader(leaderId)) {
      throw ApiException.forbidden("not_leader");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
    UUID applicantId = request.getUser().getId();
    // 신청 이후 다른 경로(초대코드 등)로 이미 크루에 들어갔으면 이 신청은 더 이상 유효하지 않다.
    if (crewMemberRepository.existsByUserId(applicantId)) {
      request.cancel();
      crewJoinRequestRepository.save(request);
      throw ApiException.conflict("applicant_already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crew.getId()) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }

    crewMemberRepository.save(
        CrewMember.builder().crew(crew).user(request.getUser()).joinedAt(OffsetDateTime.now()).build());
    request.approve(leaderId);
    crewJoinRequestRepository.save(request);
    cancelOtherPendingApplications(applicantId, requestId);

    eventPublisher.publishEvent(
        new CrewEvents.CrewApplyApproved(applicantId, crew.getName(), crew.getId()));
  }

  /** 가입 신청 거절(리더 전용) — 사유는 선택. 거절 시각부터 {@value #APPLY_COOLDOWN_HOURS}h 재신청 쿨다운. */
  @Transactional
  public void reject(UUID leaderId, long requestId, String rawReason) {
    CrewJoinRequest request = crewJoinRequestRepository.findWithCrewAndUserById(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    Crew crew = request.getCrew();
    if (!crew.isLeader(leaderId)) {
      throw ApiException.forbidden("not_leader");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
    String reason = validateBoundedText(rawReason, REJECT_REASON_MAX, "invalid_reject_reason");

    request.reject(leaderId, reason);
    crewJoinRequestRepository.save(request);

    eventPublisher.publishEvent(new CrewEvents.CrewApplyRejected(
        request.getUser().getId(), crew.getName(), reason, crew.getId()));
  }

  /** 신청 철회(신청자 본인). */
  @Transactional
  public void cancelApplication(UUID meId, long requestId) {
    CrewJoinRequest request = crewJoinRequestRepository.findById(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    if (!request.getUser().getId().equals(meId)) {
      throw ApiException.forbidden("not_your_request");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
    request.cancel();
    crewJoinRequestRepository.save(request);
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
        return;
      }
      crew.transferLeader(successor.get().getUser());
      crewRepository.save(crew);
    }
    crewMemberRepository.delete(membership.get());
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────

  /** 이번 주 시작(KST 월요일 00:00). 크루 보드 집계의 하한 경계. */
  private static OffsetDateTime weekStartKst() {
    LocalDate monday = LocalDate.now(KST).with(DayOfWeek.MONDAY);
    return monday.atStartOfDay(KST).toOffsetDateTime();
  }

  private Crew findByCode(String rawCode) {
    String code = rawCode == null ? "" : rawCode.trim().toUpperCase();
    if (code.isEmpty()) {
      throw ApiException.notFound("crew_not_found");
    }
    return crewRepository.findByJoinCode(code)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
  }

  private CrewMember requireMembership(UUID meId) {
    return CrewGuards.requireMembership(crewMemberRepository, meId);
  }

  private Crew requireLeader(UUID meId, long crewId) {
    Crew crew = crewRepository.findById(crewId)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
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

  /** 지역 코드 검증 — 생성·프로필수정 둘 다 필수(빈 값 불허, updateProfile도 항상 유효 지역을 유지). */
  private static String validateRegion(String raw) {
    String region = raw == null ? "" : raw.trim().toUpperCase();
    if (!VALID_REGIONS.contains(region)) {
      throw ApiException.badRequest("invalid_region");
    }
    return region;
  }

  /** 대표 이미지 URL 검증 — 우리 S3 버킷에서 발급된 URL만 허용(외부 URL 주입 차단). null/빈 값=이미지 없음. */
  private String validateImageUrl(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    String url = raw.trim();
    if (!imageUploadService.isStoredUrl(url)) {
      throw ApiException.badRequest("invalid_image_url");
    }
    return url;
  }

  private List<String> validateImageUrls(List<String> rawImageUrls, String fallbackImageUrl) {
    List<String> rawList = rawImageUrls != null ? rawImageUrls : (fallbackImageUrl == null ? List.of() : List.of(fallbackImageUrl));
    List<String> urls = new ArrayList<>();
    for (String raw : rawList) {
      String url = validateImageUrl(raw);
      if (url == null || urls.contains(url)) continue;
      urls.add(url);
      if (urls.size() > PROFILE_IMAGE_MAX) {
        throw ApiException.badRequest("too_many_images");
      }
    }
    return urls;
  }

  private List<String> profileImageUrls(Crew crew) {
    String json = crew.getImageUrlsJson();
    if (json != null && !json.isBlank()) {
      try {
        List<String> parsed = objectMapper.readValue(
            json,
            objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        return validateImageUrls(parsed, crew.getImageUrl());
      } catch (JsonProcessingException e) {
        throw new IllegalStateException("crew_image_urls_decode_failed", e);
      }
    }
    String imageUrl = crew.getImageUrl();
    return imageUrl == null || imageUrl.isBlank() ? List.of() : List.of(imageUrl);
  }

  private String toImageUrlsJson(List<String> imageUrls) {
    if (imageUrls == null || imageUrls.isEmpty()) return null;
    try {
      return objectMapper.writeValueAsString(imageUrls);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("crew_image_urls_encode_failed", e);
    }
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
   * 어떤 경로로든(승인/초대코드/직접생성) 크루에 들어간 유저의 다른 대기중 신청을 전부 취소한다.
   * exceptRequestId는 방금 APPROVED로 확정된 요청 id(그 자체는 취소 대상 아님) — 나머지 경로는 null.
   */
  private void cancelOtherPendingApplications(UUID userId, Long exceptRequestId) {
    for (CrewJoinRequest pending : crewJoinRequestRepository.findPendingByUserId(userId)) {
      if (exceptRequestId != null && pending.getId().equals(exceptRequestId)) {
        continue;
      }
      pending.cancel();
      crewJoinRequestRepository.save(pending);
    }
  }

  /** 주간 목표 검증 — null(목표 없음) 또는 1~9,999km. */
  private static BigDecimal validateWeekGoal(BigDecimal weekGoalKm) {
    if (weekGoalKm == null) {
      return null;
    }
    if (weekGoalKm.compareTo(BigDecimal.ONE) < 0
        || weekGoalKm.compareTo(BigDecimal.valueOf(9999)) > 0) {
      throw ApiException.badRequest("invalid_week_goal");
    }
    return weekGoalKm;
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
