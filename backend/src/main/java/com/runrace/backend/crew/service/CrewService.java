package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewJoinInfoResponse;
import com.runrace.backend.crew.dto.CrewRecapResponse;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewMemberRow;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewView;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.Nullable;
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

  /** 주간 보드 경계의 단일 기준 — 기존 운동일 집계와 동일하게 KST를 쓴다. */
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");
  /** 프론트 stripForbiddenText와 동일한 금지 문자 집합. */
  private static final char[] FORBIDDEN_CHARS = {'\'', '"', ';', '\\', '`', '<', '>'};
  /** 초대 코드 문자 — 혼동되는 I·L·O·0·1 제외. */
  private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  private static final int CODE_LEN = 6;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final AppUserRepository appUserRepository;
  private final WorkoutSessionRepository workoutSessionRepository;

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

    List<UUID> memberIds = members.stream().map(m -> m.getUser().getId()).toList();
    OffsetDateTime now = OffsetDateTime.now();
    OffsetDateTime weekStart = weekStartKst();
    Map<UUID, long[]> agg = new HashMap<>();
    for (var row : workoutSessionRepository.aggregateDistanceSince(memberIds, weekStart)) {
      agg.put(row.getUserId(), new long[] {row.getDistanceM(), row.getRuns()});
    }

    // 지난주 같은 경과 시점까지의 크루 합계 — "지난주 이맘때 대비"의 공정 비교 기준.
    OffsetDateTime lastWeekStart = weekStart.minusDays(7);
    OffsetDateTime lastWeekSameTime = lastWeekStart.plus(java.time.Duration.between(weekStart, now));
    long lastWeekSum = workoutSessionRepository
        .aggregateDistanceBetween(memberIds, lastWeekStart, lastWeekSameTime).stream()
        .mapToLong(WorkoutSessionRepository.UserDistanceAgg::getDistanceM)
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
    List<UUID> memberIds = members.stream().map(m -> m.getUser().getId()).toList();

    OffsetDateTime weekStart = weekStartKst();
    OffsetDateTime lastWeekStart = weekStart.minusDays(7);

    long total = 0;
    long runs = 0;
    UUID mvpId = null;
    long mvpDist = 0;
    for (var row : workoutSessionRepository
        .aggregateDistanceBetween(memberIds, lastWeekStart, weekStart)) {
      total += row.getDistanceM();
      runs += row.getRuns();
      if (row.getDistanceM() > mvpDist) {
        mvpDist = row.getDistanceM();
        mvpId = row.getUserId();
      }
    }

    String mvpNickname = null;
    if (mvpId != null) {
      final UUID id = mvpId;
      mvpNickname = members.stream()
          .filter(m -> m.getUser().getId().equals(id))
          .findFirst()
          .map(m -> m.getUser().getNickname())
          .orElse(null);
    }

    LocalDate startDate = lastWeekStart.atZoneSameInstant(KST).toLocalDate();
    return new CrewRecapResponse(
        startDate.toString(), startDate.plusDays(6).toString(),
        total, (int) runs,
        members.isEmpty() ? 0 : total / members.size(),
        mvpNickname, mvpDist);
  }

  /** 초대 랜딩 정보 — 비로그인 가능. 로그인 시 내 소속 상태를 함께 판정한다. */
  @Transactional(readOnly = true)
  public CrewJoinInfoResponse joinInfo(String code, @Nullable UUID meId) {
    Crew crew = findByCode(code);
    int count = crewMemberRepository.countByCrewId(crew.getId());

    String status;
    Optional<CrewMember> membership =
        meId == null ? Optional.empty() : crewMemberRepository.findByUserId(meId);
    if (membership.isPresent()) {
      status = membership.get().getCrew().getId().equals(crew.getId())
          ? "ALREADY_MEMBER"
          : "IN_OTHER_CREW";
    } else {
      status = count >= crew.getMaxMembers() ? "FULL" : "JOINABLE";
    }
    return new CrewJoinInfoResponse(crew.getName(), count, crew.getMaxMembers(), status);
  }

  // ── 생성·가입·탈퇴 ────────────────────────────────────────────

  /** 크루 생성 — 생성자가 리더가 되고 멤버로도 들어간다(1인 1크루). */
  @Transactional
  public void create(UUID meId, String rawName) {
    String name = validateName(rawName);
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
        .createdAt(now)
        .build());
    crewMemberRepository.save(CrewMember.builder().crew(crew).user(me).joinedAt(now).build());
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
  public void update(UUID meId, long crewId, String rawName, String rawNotice, BigDecimal weekGoalKm) {
    Crew crew = requireLeader(meId, crewId);
    String name = validateName(rawName);
    if (!name.equals(crew.getName()) && crewRepository.existsByName(name)) {
      throw ApiException.conflict("crew_name_taken");
    }
    String notice = validateNotice(rawNotice);
    crew.updateInfo(name, notice, validateWeekGoal(weekGoalKm));
    crewRepository.save(crew);
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
    return crewMemberRepository.findByUserId(meId)
        .orElseThrow(() -> ApiException.notFound("not_in_crew"));
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
    if (raw == null) {
      return null;
    }
    String notice = raw.trim();
    if (notice.isEmpty()) {
      return null;
    }
    if (notice.length() > NOTICE_MAX || containsForbiddenChar(notice)) {
      throw ApiException.badRequest("invalid_notice");
    }
    return notice;
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
    for (char c : FORBIDDEN_CHARS) {
      if (value.indexOf(c) >= 0) {
        return true;
      }
    }
    return false;
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
