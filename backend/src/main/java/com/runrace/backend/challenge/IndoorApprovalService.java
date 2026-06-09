package com.runrace.backend.challenge;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.RejectedApprovalResponse;
import com.runrace.backend.workout.WorkoutEvents;
import com.runrace.backend.workout.WorkoutSession;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 실내러닝(러닝머신) 승인 워크플로우.
 * 레이스 구성원 투표로 거리 반영 여부를 결정한다.
 * 전원 승인 시 거리 반영은 {@link ChallengeProgressService}에 위임한다.
 */
@Service
@RequiredArgsConstructor
public class IndoorApprovalService {
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final ChallengeProgressService challengeProgressService;
  private final ApplicationEventPublisher eventPublisher;

  /** 실내러닝 — 레이스별 PENDING ChallengeWorkout + 개별 승인 행 생성. */
  @Transactional
  public void createPendingIndoorApprovals(UUID userId, WorkoutSession session, int distanceM) {
    if (distanceM <= 0) return;
    OffsetDateTime now = OffsetDateTime.now();
    List<ChallengeMember> activeMembers = challengeMemberRepository.findAllActiveForUser(userId, now);

    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(
          challenge.getId(), session.getId())) continue;

      ChallengeWorkout cw = new ChallengeWorkout();
      cw.setChallenge(challenge);
      cw.setWorkoutSession(session);
      cw.setUser(member.getUser());
      cw.setAppliedDistanceM(distanceM);
      cw.setApprovalStatus(ApprovalStatus.PENDING);
      cw.setCreatedAt(now);
      ChallengeWorkout saved = challengeWorkoutRepository.save(cw);

      List<ChallengeMember> allMembers = challengeMemberRepository.findAllForChallenge(challenge.getId());
      List<UUID> voterIds = new ArrayList<>();
      List<IndoorRunApproval> approvals = new ArrayList<>();
      for (ChallengeMember voter : allMembers) {
        if (voter.getUser().getId().equals(userId)) continue;
        IndoorRunApproval approval = new IndoorRunApproval();
        approval.setChallengeWorkout(saved);
        approval.setVoter(voter.getUser());
        approval.setCreatedAt(now);
        approvals.add(approval);
        voterIds.add(voter.getUser().getId());
      }
      indoorRunApprovalRepository.saveAll(approvals);

      // 투표자가 없으면(혼자 참가 중) 즉시 승인
      if (voterIds.isEmpty()) {
        saved.setApprovalStatus(ApprovalStatus.APPROVED);
        challengeWorkoutRepository.save(saved);
        applyApprovedIndoorRun(saved.getId());
      } else {
        String nickname = member.getUser().getNickname();
        eventPublisher.publishEvent(new WorkoutEvents.IndoorRunPendingApprovalEvent(
            saved.getId(), challenge.getId(), userId, voterIds, nickname));
      }
    }
  }

  /** 전원 승인 시 호출 — 거리를 레이스 멤버 기록에 반영한다. */
  @Transactional
  public void applyApprovedIndoorRun(Long challengeWorkoutId) {
    ChallengeWorkout cw = challengeWorkoutRepository.findById(challengeWorkoutId)
        .orElseThrow(() -> ApiException.notFound("challenge_workout_not_found"));

    cw.setApprovalStatus(ApprovalStatus.APPROVED);
    challengeWorkoutRepository.save(cw);

    Challenge challenge = cw.getChallenge();
    UUID userId = cw.getUser().getId();
    BigDecimal distanceKm = BigDecimal.valueOf(cw.getAppliedDistanceM())
        .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
    OffsetDateTime now = OffsetDateTime.now();

    challengeMemberRepository.findByChallengeIdAndUserId(challenge.getId(), userId)
        .ifPresent(member -> challengeProgressService.applyDistanceToMember(member, distanceKm, now));

    eventPublisher.publishEvent(new WorkoutEvents.IndoorRunApprovedEvent(challengeWorkoutId, userId));
  }

  /** 레이스의 승인 대기 중인 실내러닝 목록. */
  @Transactional(readOnly = true)
  public List<PendingApprovalResponse> getPendingApprovals(Long challengeId, UUID viewerUserId) {
    List<ChallengeWorkout> pending = challengeWorkoutRepository
        .findAllByChallengeIdAndApprovalStatus(challengeId, ApprovalStatus.PENDING);

    Map<Long, List<IndoorRunApproval>> votesByWorkout = votesByChallengeWorkout(pending);

    return pending.stream().map(cw -> {
      WorkoutSession ws = cw.getWorkoutSession();
      List<IndoorRunApproval> votes =
          votesByWorkout.getOrDefault(cw.getId(), List.of());
      long approvedCount = votes.stream().filter(v -> Boolean.TRUE.equals(v.getApproved())).count();
      Boolean myVote = votes.stream()
          .filter(v -> v.getVoter().getId().equals(viewerUserId))
          .findFirst()
          .map(IndoorRunApproval::getApproved)
          .orElse(null);
      boolean canVote = votes.stream().anyMatch(v -> v.getVoter().getId().equals(viewerUserId));
      Boolean myVoteFinal = canVote ? myVote : null;

      return new PendingApprovalResponse(
          cw.getId(),
          ws.getId(),
          cw.getUser().getNickname(),
          ws.getDistanceM(),
          ws.getDurationSec(),
          ws.getAvgPaceSecPerKm(),
          ws.getImageUrl(),
          ws.getStartedAt().toString(),
          myVoteFinal,
          canVote,
          votes.size(),
          (int) approvedCount
      );
    }).toList();
  }

  /** 레이스의 거부된 실내러닝 목록. */
  @Transactional(readOnly = true)
  public List<RejectedApprovalResponse> getRejectedApprovals(Long challengeId) {
    List<ChallengeWorkout> rejected = challengeWorkoutRepository
        .findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(challengeId, ApprovalStatus.REJECTED);

    Map<Long, List<IndoorRunApproval>> votesByWorkout = votesByChallengeWorkout(rejected);

    return rejected.stream().map(cw -> {
      WorkoutSession ws = cw.getWorkoutSession();
      List<String> rejectorNicknames =
          votesByWorkout.getOrDefault(cw.getId(), List.<IndoorRunApproval>of())
          .stream()
          .filter(v -> Boolean.FALSE.equals(v.getApproved()))
          .map(v -> v.getVoter().getNickname())
          .filter(n -> n != null && !n.isBlank())
          .distinct()
          .toList();

      return new RejectedApprovalResponse(
          cw.getId(),
          ws.getId(),
          cw.getUser().getNickname(),
          ws.getDistanceM(),
          ws.getDurationSec(),
          ws.getImageUrl(),
          ws.getStartedAt().toString(),
          rejectorNicknames
      );
    }).toList();
  }

  /** 여러 ChallengeWorkout의 투표를 한 번의 쿼리로 조회해 workoutId별로 묶는다(N+1 방지). */
  private Map<Long, List<IndoorRunApproval>> votesByChallengeWorkout(List<ChallengeWorkout> workouts) {
    if (workouts.isEmpty()) return Map.of();
    List<Long> ids = workouts.stream().map(ChallengeWorkout::getId).toList();
    return indoorRunApprovalRepository.findAllByChallengeWorkoutIdIn(ids).stream()
        .collect(Collectors.groupingBy(a -> a.getChallengeWorkout().getId()));
  }
}
