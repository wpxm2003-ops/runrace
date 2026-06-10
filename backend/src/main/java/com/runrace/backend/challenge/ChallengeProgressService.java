package com.runrace.backend.challenge;

import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 대결 진행(누적 거리) 엔진.
 * 운동 기록 반영/되돌림, 완주·마일스톤·추월 처리를 담당한다.
 * GPS 운동(WorkoutService)과 실내러닝 승인(IndoorApprovalService)이 공통으로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class ChallengeProgressService {
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final ChallengeService challengeService;

  /**
   * 운동 기록 저장 시 호출. 사용자가 현재 참여 중인 진행 대결의 total_km을 distanceM만큼 증가시킨다.
   * - 대결 기간(startAt ~ endAt) 안에 있고 아직 승자가 없는 대결만 대상으로 한다.
   * - 목표 달성 시 완주 처리 및 승자 확정까지 함께 수행한다.
   */
  @Transactional
  public void applyWorkoutDistance(UUID userId, long workoutSessionId, int distanceM) {
    if (distanceM <= 0) return;
    BigDecimal distanceKm = toKm(distanceM);
    OffsetDateTime now = OffsetDateTime.now();

    List<ChallengeMember> activeMembers = challengeMemberRepository.findAllActiveForUser(userId, now);
    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      // 방장 혼자인 레이스는 무효 종료하고 거리 반영하지 않는다.
      if (challengeService.endIfSolo(challenge, now)) continue;
      applyDistanceToMember(member, distanceKm, now);
      recordWorkoutLink(challenge, workoutSessionId, userId, distanceM, now);
    }
  }

  /**
   * 멤버 누적 거리에 deltaKm를 더하고, 완주/마일스톤/추월 이벤트를 발행한다.
   * 진행 중 트랜잭션 안에서 호출되는 것을 전제로 한다(GPS·실내러닝 승인 공통 경로).
   */
  public void applyDistanceToMember(ChallengeMember member, BigDecimal deltaKm, OffsetDateTime now) {
    Challenge challenge = member.getChallenge();
    BigDecimal prevKm = member.getTotalKm();
    BigDecimal next = prevKm.add(deltaKm);
    BigDecimal goal = ChallengeService.goalKmAsDecimal(challenge);

    // 순위 변동 감지: 업데이트 전 전체 멤버 조회
    List<ChallengeMember> allMembers = challengeMemberRepository.findAllForChallenge(challenge.getId());

    member.setTotalKm(next);
    member.setLastSyncAt(now);
    onMemberProgress(member, next);
    challengeMemberRepository.save(member);

    publishMilestoneEvents(member, prevKm, next, goal, allMembers);
    publishOvertakeEvent(member, prevKm, next, allMembers);
  }

  /**
   * 멤버 누적 거리가 목표를 처음 달성하면 완주 시각을 기록하고, 아직 승자가 없으면 승자로 확정한다.
   * 진행 중 트랜잭션 안에서 호출되는 것을 전제로 한다.
   */
  public void onMemberProgress(ChallengeMember member, BigDecimal nextTotalKm) {
    Challenge challenge = member.getChallenge();
    if (nextTotalKm.compareTo(ChallengeService.goalKmAsDecimal(challenge)) >= 0
        && member.getFinishedAt() == null) {
      member.setFinishedAt(OffsetDateTime.now());
      if (challenge.getWinner() == null) {
        challenge.setWinner(member.getUser());
      }
      boolean allOtherFinished = challengeMemberRepository
          .countByChallengeIdAndIdNotAndFinishedAtIsNull(challenge.getId(), member.getId()) == 0;
      if (allOtherFinished) {
        challenge.setEnded(true);
        var winner = challenge.getWinner();
        List<UUID> memberIds = challengeMemberRepository.findAllForChallenge(challenge.getId())
            .stream().map(m -> m.getUser().getId()).toList();
        eventPublisher.publishEvent(new ChallengeEndedEvent(
            challenge.getId(), winner != null ? winner.getNickname() : null, memberIds));
      }
      challengeRepository.save(challenge);
    }
  }

  /**
   * 운동 기록 삭제 시 호출. challenge_workout 링크를 찾아 적용된 거리를 총 거리에서 차감한다.
   * - 완주 처리된 멤버가 목표 이하로 내려가면 finishedAt을 초기화한다.
   * - 해당 멤버가 대결 승자였으면 winner도 초기화한다.
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
      BigDecimal subtractKm = toKm(link.getAppliedDistanceM());

      challengeMemberRepository
          .findByChallengeIdAndUserId(challenge.getId(), userId)
          .ifPresent(member -> {
            BigDecimal next = member.getTotalKm().subtract(subtractKm).max(BigDecimal.ZERO);
            member.setTotalKm(next);
            member.setLastSyncAt(OffsetDateTime.now());

            // 목표 미달로 내려가면 완주 상태 초기화
            if (member.getFinishedAt() != null
                && next.compareTo(ChallengeService.goalKmAsDecimal(challenge)) < 0) {
              member.setFinishedAt(null);
              challenge.setEnded(false);
              if (challenge.getWinner() != null && challenge.getWinner().getId().equals(userId)) {
                challenge.setWinner(null);
              }
              challengeRepository.save(challenge);
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

    for (int pct : new int[]{50}) {
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
    ChallengeWorkout link = new ChallengeWorkout();
    link.setChallenge(challenge);
    link.setWorkoutSession(workoutSessionRepository.getReferenceById(workoutSessionId));
    link.setUser(appUserRepository.getReferenceById(userId));
    link.setAppliedDistanceM(appliedDistanceM);
    link.setCreatedAt(now);
    challengeWorkoutRepository.save(link);
  }

  private static BigDecimal toKm(int distanceM) {
    return BigDecimal.valueOf(distanceM).divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
  }
}
