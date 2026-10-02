package com.runrace.backend.challenge.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.RaceRules;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.common.TextValidation;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.service.CrewGuards;
import com.runrace.backend.event.ChallengeEvents.ChallengeEndedNoParticipantsEvent;
import com.runrace.backend.event.ChallengeEvents;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 레이스 방 관리 — 생성/수정/삭제/참가/탈퇴, 목록·상세 조회, 승자 확정.
 * 누적 거리 반영은 {@link ChallengeProgressService}, 실내러닝 승인은 {@link IndoorApprovalService}.
 */
@Service
@RequiredArgsConstructor
public class ChallengeService {
  public static final int MAX_ACTIVE_ROOMS_PER_CREATOR = 3;

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengePrizeRepository challengePrizeRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final CrewMemberRepository crewMemberRepository;
  private final ActivityHistoryService activityHistoryService;

  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String langCd,
      String stake) {
    return createRoom(principal, title, goalKm, maxMembers, startAt, endAt, langCd, stake, false);
  }

  /** {@code crewOnly=true}면 생성자의 소속 크루 내부 레이스로 만든다(멤버 전용·공개 목록 제외). */
  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String langCd,
      String stake,
      boolean crewOnly) {
    // 입력 검증
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    // 크루 전용이면 생성자의 소속 크루에 귀속(미소속이면 여기서 막힌다)
    Long crewId = crewOnly ? requireOwnCrewId(principal) : null;

    // 방장당 활성 방 개수 제한
    // 생성자 행을 잠그고 센다 — 잠그지 않으면 병렬 요청이 전부 한도 미달 상태를 읽고 통과해
    // 한도가 무력화된다(활성 조건이 시간 의존이라 DB 제약으로는 막을 수 없다).
    // 같은 사용자의 동시 생성끼리만 대기하므로 정상 사용에는 영향이 없다.
    AppUser creator = appUserRepository.getRequiredForUpdate(principal.userId());
    ensureActiveRoomLimit(creator);

    // 방 저장
    Challenge saved =
        saveRoom(creator, title, goalKm, maxMembers, startAt, endAt, langCd, stake, crewId);

    // 방장을 첫 참가자로 등록
    challengeMemberRepository.save(newMember(saved, creator));

    activityHistoryService.recordSelf(
        principal.userId(),
        ActivityAction.RACE_CREATED,
        ActivityTargetType.RACE,
        saved.getId(),
        Map.of("crewOnly", crewOnly));

    return saved;
  }

  private Long requireOwnCrewId(AuthPrincipal principal) {
    return CrewGuards.requireMembership(crewMemberRepository, principal.userId())
        .getCrew().getId();
  }

  private void ensureActiveRoomLimit(AppUser creator) {
    if (challengeRepository.countActiveByCreator(creator.getId(), OffsetDateTime.now())
        >= MAX_ACTIVE_ROOMS_PER_CREATOR) {
      throw ApiException.conflict("active_room_limit");
    }
  }

  private Challenge saveRoom(
      AppUser creator,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String langCd,
      String stake,
      Long crewId) {
    Challenge challenge = Challenge.builder()
        .creator(creator)
        .createdAt(OffsetDateTime.now())
        // 언어는 생성 시점에만 고정한다(수정 시 변경하지 않음).
        .langCd(SupportedLanguages.normalizeOrDefault(langCd))
        .title(title.trim())
        .goalKm(goalKm.setScale(3, RoundingMode.HALF_UP))
        .maxMembers(maxMembers)
        .startAt(startAt)
        .endAt(endAt)
        .stake(cleanStake(stake))
        .crewId(crewId)
        .build();
    return challengeRepository.save(challenge);
  }

  /**
   * 공식(자동 보충) 공개 레이스 생성 — 스케줄러 전용.
   *
   * <p>신규 유저가 언제 들어와도 참가할 레이스가 있도록 시스템이 여는 온램프용 레이스다.
   * 입력 검증은 일반 생성과 동일하게 재사용하되, 방장당 활성 방 개수 제한
   * ({@link #MAX_ACTIVE_ROOMS_PER_CREATOR})은 적용하지 않는다 — 시스템이 회차를 관리하므로
   * 운영 계정의 개인 레이스 한도와 경쟁시키지 않는다.
   */
  @Transactional
  public Challenge createOfficialRace(
      UUID creatorId,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    // 입력 검증
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    // 방 저장 — 스케줄러가 만드는 공개 레이스라 언어는 ko 고정, 내기·크루 귀속 없음.
    // (방장 활성 방 한도는 적용하지 않는다 — 사용자가 만든 방이 아니다.)
    AppUser creator = appUserRepository.getRequired(creatorId);
    Challenge saved =
        saveRoom(creator, title, goalKm, maxMembers, startAt, endAt, "ko", null, null);

    // 방장을 첫 참가자로 등록
    challengeMemberRepository.save(newMember(saved, creator));

    return saved;
  }

  @Transactional
  public Challenge updateRoom(
      AuthPrincipal principal,
      Long id,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String stake) {
    // 잠근 채로 읽는다 — 잠그지 않으면 정원 축소 검증과 저장 사이에 동시 참가가 끼어들어
    // "정원 < 실제 인원" 모순 상태가 될 수 있다(joinRoom과 같은 이유의 TOCTOU).
    Challenge challenge = challengeRepository.getRequiredForUpdate(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    if (maxMembers < challengeMemberRepository.countByChallengeId(id)) {
      throw ApiException.badRequest("max_members_too_small");
    }

    challenge.updateRoom(
        title.trim(), goalKm.setScale(3, RoundingMode.HALF_UP), maxMembers, startAt, endAt,
        cleanStake(stake));
    Challenge saved = challengeRepository.save(challenge);
    activityHistoryService.recordSelf(
        principal.userId(), ActivityAction.RACE_UPDATED, ActivityTargetType.RACE, id);
    return saved;
  }

  /** 내기 텍스트 정리 — 선택값이라 비어있으면 null, 있으면 길이·금칙어 검증 후 트림본 반환. */
  private static final int STAKE_MAX_CHARS = 30;

  private String cleanStake(String raw) {
    if (raw == null || raw.isBlank()) return null;
    return TextValidation.requireCleanText(raw, STAKE_MAX_CHARS, false, "stake");
  }

  @Transactional
  public void deleteRoom(AuthPrincipal principal, Long id) {
    Challenge challenge = requireChallenge(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    List<String> prizeKeys = collectPrizeImageKeys(id);
    challengeRepository.delete(challenge);
    activityHistoryService.recordSelf(
        principal.userId(), ActivityAction.RACE_DELETED, ActivityTargetType.RACE, id);
    ChallengeEvents.publishPrizeCleanup(eventPublisher, prizeKeys);
  }

  public static boolean hasStarted(Challenge challenge, OffsetDateTime now) {
    return !now.isBefore(challenge.getStartAt());
  }

  public static boolean isEnded(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded()) {
      return true;
    }
    return challenge.getEndAt() != null && now.isAfter(challenge.getEndAt());
  }

  private Challenge requireChallenge(Long id) {
    return challengeRepository.findByIdWithDetails(id)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  private ChallengeMember newMember(Challenge challenge, AppUser user) {
    boolean isCreator = challenge.getCreator().getId().equals(user.getId());
    return ChallengeMember.builder()
        .challenge(challenge)
        .user(user)
        .totalKm(BigDecimal.ZERO)
        .joinedAt(isCreator ? challenge.getCreatedAt() : OffsetDateTime.now())
        .build();
  }

  private static final int TITLE_MAX_BYTES = 50;
  /** 방 정원 상한 — 온램프 자동 생성(ChallengeScheduler)도 이 값을 참조한다. */
  static final int MAX_MEMBERS_LIMIT = 50;
  private void validateRoomInput(
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    TextValidation.requireCleanText(title, TITLE_MAX_BYTES, true, "title");
    if (goalKm == null
        || goalKm.signum() <= 0
        || goalKm.compareTo(BigDecimal.valueOf(RaceRules.MAX_GOAL_KM)) > 0) {
      throw ApiException.badRequest("invalid_goal_km");
    }
    if (maxMembers < 1 || maxMembers > MAX_MEMBERS_LIMIT) {
      throw ApiException.badRequest("invalid_max_members");
    }
    RaceRules.validateWindow(startAt, endAt);
  }

  private void ensureOwner(AuthPrincipal principal, Challenge challenge) {
    if (!challenge.isOwner(principal.userId())) {
      throw ApiException.forbidden("forbidden");
    }
  }

  private void ensureNotStarted(Challenge challenge) {
    if (hasStarted(challenge, OffsetDateTime.now())) {
      throw ApiException.conflict("already_started");
    }
  }

  private List<String> collectPrizeImageKeys(Long challengeId) {
    return challengePrizeRepository.findByChallengeIdOrderByRank(challengeId).stream()
        .map(ChallengePrize::getImageKey)
        .filter(Objects::nonNull)
        .toList();
  }

  public record ChallengeDetailView(
      Challenge challenge,
      List<ChallengeMember> members,
      UUID currentUserId,
      boolean isMember,
      boolean isOwner,
      boolean hasStarted,
      boolean hasEnded,
      int memberCount,
      Set<UUID> rivalUserIds,
      String crewName,
      /** 크루 레이스면 그 크루 멤버인지, 일반 레이스면 항상 true. 참가 버튼·라이브 공개 기준. */
      boolean crewInsider) {

    /**
     * 라이브(잠정) 진행률을 이 조회자에게 보여줘도 되는지 — 표시 여부를 가르는 단일 판정.
     *
     * <p>셋 다 만족해야 한다.
     * <ul>
     *   <li>인증: 비인증 조회자에게는 개인 식별 가능한 실시간 신호를 절대 내보내지 않는다.
     *   <li>미종료: 끝난 레이스는 확정값만 보여야 한다. final_rank는 확정값 기준으로 매겨지므로
     *       종료 화면에서 라이브를 접으면 순서·메달·추격 문구가 확정 순위와 어긋난다
     *       (종료 확정 경로는 live_km을 지우지 않아 15분간 남는다).
     *   <li>내부자: 크루 레이스 상세는 크루 밖 로그인 사용자도 조회할 수 있다. 인증만으로 열면
     *       크루 공유를 기본 허용한 근거인 "이미 서로 아는 폐쇄 로스터"가 성립하지 않는다.
     *       크루를 나간 뒤에도 그 레이스를 뛰는 참가자는 isMember로 함께 통과시킨다.
     * </ul>
     *
     * <p>컨트롤러 인라인 조건이 아니라 여기 둔 이유: 이 판정이 프라이버시 경계라 단위 테스트로
     * 잠글 수 있어야 한다. 조건 하나가 조용히 빠져도 컨트롤러 테스트가 없어 아무도 못 잡는다.
     */
    public boolean mayFoldLive(boolean authenticated) {
      return authenticated && !hasEnded && (crewInsider || isMember);
    }
  }
}
