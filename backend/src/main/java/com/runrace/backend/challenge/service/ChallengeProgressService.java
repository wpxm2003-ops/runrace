package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.event.MilestoneReachedEvent;
import com.runrace.backend.challenge.event.RankOvertakeEvent;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.common.Distance;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 레이스 진행(누적 거리) 엔진.
 * 운동 기록 반영/되돌림, 완주·마일스톤·추월 처리를 담당한다.
 * GPS 운동(WorkoutService)과 실내러닝 승인(IndoorApprovalService)이 공통으로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class ChallengeProgressService {
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
  /** 달성률 마일스톤 알림 임계값(%). */
  private static final int[] MILESTONE_PERCENTS = {50};

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final ChallengeService challengeService;
  private final RaceFinalizationService raceFinalization;

  /**
   * 운동 기록 저장 시 호출. 사용자가 현재 참여 중인 진행 레이스의 total_km을 distanceM만큼 증가시킨다.
   * - 레이스 기간(startAt ~ endAt) 안에 있고 아직 승자가 없는 레이스만 대상으로 한다.
   * - 목표 달성 시 완주 처리 및 승자 확정까지 함께 수행한다.
   */
  @Transactional
  public void applyWorkoutDistance(UUID userId, long workoutSessionId, int distanceM) {
    if (distanceM <= 0) return;
    BigDecimal distanceKm = Distance.toKm(distanceM);
    OffsetDateTime now = OffsetDateTime.now();

    forEachActiveChallengeMember(userId, now, (member, allMembers) -> {
      applyDistanceToMemberWithContext(member, distanceKm, now, allMembers);
      recordWorkoutLink(member.getChallenge(), workoutSessionId, userId, distanceM, now);
    });
  }

  /**
   * 사용자가 현재 참여 중(진행 중·미완주)인 모든 레이스 멤버를 순회하며 {@code body}를 실행한다.
   * - 관련 레이스의 전체 멤버를 단일 쿼리로 사전 로드해 루프 내 N+1을 방지하고, {@code body}에 함께 넘긴다.
   * - 방장 혼자인 레이스는 삭제({@link ChallengeService#deleteIfSolo})하고 건너뛴다.
   * GPS 운동 반영·실내러닝 승인 생성·헬스데이터 동기화가 공통으로 사용한다.
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다.
   */
  public void forEachActiveChallengeMember(
      UUID userId, OffsetDateTime now,
      BiConsumer<ChallengeMember, List<ChallengeMember>> body) {
    List<ChallengeMember> activeMembers = challengeMemberRepository.findAllActiveForUser(userId, now);
    if (activeMembers.isEmpty()) return;

    // N+1 방지: 관련 챌린지 전체 멤버를 단일 쿼리로 사전 로드
    List<Long> challengeIds = activeMembers.stream()
        .map(m -> m.getChallenge().getId()).toList();
    Map<Long, List<ChallengeMember>> membersByChallenge =
        challengeMemberRepository.findAllByChallengeIdIn(challengeIds).stream()
            .collect(Collectors.groupingBy(m -> m.getChallenge().getId()));

    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      // 방장 혼자인 레이스는 삭제하고 거리 반영하지 않는다.
      if (challengeService.deleteIfSolo(challenge, now)) continue;
      body.accept(member, membersByChallenge.getOrDefault(challenge.getId(), List.of()));
    }
  }

  /**
   * 멤버 누적 거리에 deltaKm를 더하고, 완주/마일스톤/추월 이벤트를 발행한다.
   * 진행 중 트랜잭션 안에서 호출되는 것을 전제로 한다(GPS·실내러닝 승인 공통 경로).
   * 단건 호출용 — 내부에서 전체 멤버를 조회한다.
   */
  public void applyDistanceToMember(ChallengeMember member, BigDecimal deltaKm, OffsetDateTime now) {
    List<ChallengeMember> allMembers =
        challengeMemberRepository.findAllForChallenge(member.getChallenge().getId());
    applyDistanceToMemberWithContext(member, deltaKm, now, allMembers);
  }

  /**
   * 사전 로드된 챌린지 멤버 목록을 받아 거리를 반영한다.
   * {@link #forEachActiveChallengeMember} 경로에서 N+1 방지용으로 사용한다.
   */
  public void applyDistanceToMemberWithContext(
      ChallengeMember member, BigDecimal deltaKm, OffsetDateTime now,
      List<ChallengeMember> allChallengeMembers) {
    Challenge challenge = member.getChallenge();
    BigDecimal prevKm = member.getTotalKm();
    BigDecimal next = prevKm.add(deltaKm);
    BigDecimal goal = ChallengeService.goalKmAsDecimal(challenge);

    member.addDistance(deltaKm, now);
    onMemberProgress(member, next, allChallengeMembers);
    challengeMemberRepository.save(member);

    publishMilestoneEvents(member, prevKm, next, goal, allChallengeMembers);
    publishOvertakeEvent(member, prevKm, next, allChallengeMembers);
  }

  /**
   * 멤버 누적 거리가 목표를 처음 달성하면 완주 시각을 기록하고, 아직 승자가 없으면 승자로 확정한다.
   * 전원 완주 시 레이스을 종료하고 종료 이벤트를 발행한다.
   * 사전 로드된 멤버 목록을 받아 findAllForChallenge 중복 조회를 방지하며,
   * applyDistanceToMemberWithContext 에서 호출된다(진행 중 트랜잭션 전제).
   */
  private void onMemberProgress(ChallengeMember member, BigDecimal nextTotalKm,
                                 List<ChallengeMember> allMembers) {
    Challenge challenge = member.getChallenge();
    if (nextTotalKm.compareTo(ChallengeService.goalKmAsDecimal(challenge)) >= 0
        && member.getFinishedAt() == null) {
      member.markFinished(OffsetDateTime.now());
      challenge.declareWinner(member.getUser());
      boolean allOtherFinished = challengeMemberRepository
          .countByChallengeIdAndIdNotAndFinishedAtIsNull(challenge.getId(), member.getId()) == 0;
      if (allOtherFinished) {
        // 전원 완주 → 공통 종료 처리(순위·종료 이벤트·저장). 우승자는 위에서 확정한 1등.
        raceFinalization.finalizeRace(challenge, allMembers, challenge.getWinner());
      } else {
        challengeRepository.save(challenge);
      }
    }
  }

  /**
   * 운동 기록 삭제 시 호출. challenge_workout 링크를 찾아 적용된 거리를 총 거리에서 차감한다.
   * - 완주 처리된 멤버가 목표 이하로 내려가면 finishedAt을 초기화한다.
   * - 해당 멤버가 레이스 승자였으면 winner도 초기화한다.
   */
  @Transactional
  public void reverseWorkoutDistance(long workoutSessionId) {
    List<ChallengeWorkout> links = challengeWorkoutRepository.findAllByWorkoutSessionId(workoutSessionId);
    for (ChallengeWorkout link : links) {
      // PENDING/REJECTED는 거리가 아직 반영되지 않았으므로 차감 불필요
      if (link.getApprovalStatus() != ApprovalStatus.APPROVED) {
        continue; // 아래 deleteAll에서 삭제됨
      }

      Challenge challenge = link.getChallenge();
      UUID userId = link.getUser().getId();
      BigDecimal subtractKm = Distance.toKm(link.getAppliedDistanceM());

      challengeMemberRepository
          .findByChallengeIdAndUserId(challenge.getId(), userId)
          .ifPresent(member -> {
            BigDecimal next = member.getTotalKm().subtract(subtractKm).max(BigDecimal.ZERO);
            member.setDistanceAndSync(next, OffsetDateTime.now());

            // 목표 미달로 내려가면 완주 상태 초기화
            if (member.getFinishedAt() != null
                && next.compareTo(ChallengeService.goalKmAsDecimal(challenge)) < 0) {
              member.resetFinished();
              challenge.resetEnded();
              if (challenge.getWinner() != null && challenge.getWinner().getId().equals(userId)) {
                challenge.clearWinner();
              }
              challengeRepository.save(challenge);
              // 종료가 풀렸으므로 확정 순위(final_rank)도 초기화 — 전적이 잘못 집계되지 않게.
              raceFinalization.clearFinalRanks(challenge.getId());
            }
            challengeMemberRepository.save(member);
          });
    }
    if (!links.isEmpty()) {
      challengeWorkoutRepository.deleteAll(links);
    }
  }

  private void publishMilestoneEvents(
      ChallengeMember member, BigDecimal prevKm, BigDecimal next,
      BigDecimal goal, List<ChallengeMember> allMembers) {

    String nickname = member.getUser().getNickname();
    UUID achieverId = member.getUser().getId();

    List<UUID> otherIds = allMembers.stream()
        .filter(m -> !m.getUser().getId().equals(achieverId))
        .filter(m -> m.getFinishedAt() == null)
        .map(m -> m.getUser().getId())
        .toList();

    if (otherIds.isEmpty()) return;

    for (int pct : MILESTONE_PERCENTS) {
      BigDecimal threshold = goal.multiply(BigDecimal.valueOf(pct))
          .divide(HUNDRED, 3, RoundingMode.HALF_UP);
      if (prevKm.compareTo(threshold) < 0 && next.compareTo(threshold) >= 0) {
        eventPublisher.publishEvent(new MilestoneReachedEvent(
            member.getChallenge().getId(), achieverId, nickname, pct, otherIds));
      }
    }
  }

  private void publishOvertakeEvent(
      ChallengeMember member, BigDecimal prevKm, BigDecimal next,
      List<ChallengeMember> allMembers) {

    UUID overtakerId = member.getUser().getId();

    // prevKm < 상대방 km <= next 이면 추월 대상
    List<UUID> overtakenIds = allMembers.stream()
        .filter(m -> !m.getUser().getId().equals(overtakerId))
        .filter(m -> m.getTotalKm().compareTo(prevKm) > 0
                  && m.getTotalKm().compareTo(next) <= 0)
        .map(m -> m.getUser().getId())
        .toList();

    if (!overtakenIds.isEmpty()) {
      eventPublisher.publishEvent(new RankOvertakeEvent(
          member.getChallenge().getId(),
          overtakerId,
          member.getUser().getNickname(),
          overtakenIds));
    }
  }

  private void recordWorkoutLink(
      Challenge challenge, long workoutSessionId, UUID userId, int appliedDistanceM, OffsetDateTime now) {
    Long challengeId = challenge.getId();
    if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(challengeId, workoutSessionId)) {
      return;
    }
    ChallengeWorkout link = ChallengeWorkout.builder()
        .challenge(challenge)
        .workoutSession(workoutSessionRepository.getReferenceById(workoutSessionId))
        .user(appUserRepository.getReferenceById(userId))
        .appliedDistanceM(appliedDistanceM)
        .createdAt(now)
        .build();
    challengeWorkoutRepository.save(link);
  }
}
