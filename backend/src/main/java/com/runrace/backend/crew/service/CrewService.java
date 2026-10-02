package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.ForbiddenTextChars;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewMember;
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

  /** 시도 지역 코드 — 발견 목록 필터·크루 프로필의 유효값 화이트리스트. ETC=기타(백필 sentinel), ONLINE=온라인/전국. */
  static final Set<String> VALID_REGIONS = Set.of(
      "SEOUL", "BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN", "SEJONG",
      "GYEONGGI_SOUTH", "GYEONGGI_NORTH", "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM",
      "GYEONGBUK", "GYEONGNAM", "JEJU", "ONLINE", "ETC");

  /** 월간 보드 경계의 단일 기준 — 기존 운동일 집계와 동일하게 KST를 쓴다. */
  private static final ZoneId KST = KstTime.ZONE;

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
