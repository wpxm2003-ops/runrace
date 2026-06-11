package com.runrace.backend.challenge;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.Distance;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.RejectedApprovalResponse;
import com.runrace.backend.workout.WorkoutEvents;
import com.runrace.backend.workout.WorkoutSession;
import java.math.BigDecimal;
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

    challengeProgressService.forEachActiveChallengeMember(userId, now, (member, allMembers) -> {
      Challenge challenge = member.getChallenge();
      if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(
          challenge.getId(), session.getId())) return;

      ChallengeWorkout saved = challengeWorkoutRepository.save(ChallengeWorkout.builder()
          .challenge(challenge)
          .workoutSession(session)
          .user(member.getUser())
          .appliedDistanceM(distanceM)
          .approvalStatus(ApprovalStatus.PENDING)
          .createdAt(now)
          .build());

      List<UUID> voterIds = new ArrayList<>();
      List<IndoorRunApproval> approvals = new ArrayList<>();
      for (ChallengeMember voter : allMembers) {
        if (voter.getUser().getId().equals(userId)) continue;
        approvals.add(IndoorRunApproval.builder()
            .challengeWorkout(saved)
            .voter(voter.getUser())
            .createdAt(now)
            .build());
        voterIds.add(voter.getUser().getId());
      }
      indoorRunApprovalRepository.saveAll(approvals);

      // 투표자가 없으면(혼자 참가 중) 즉시 승인
      if (voterIds.isEmpty()) {
        saved.approve();
        challengeWorkoutRepository.save(saved);
        applyApprovedIndoorRun(saved.getId());
      } else {
        String nickname = member.getUser().getNickname();
        eventPublisher.publishEvent(new WorkoutEvents.IndoorRunPendingApprovalEvent(
            saved.getId(), challenge.getId(), userId, voterIds, nickname));
      }
    });
  }

  /** 해당 ChallengeWorkout의 모든 투표가 승인 상태인지 — 전원 승인 판정(거리 반영 트리거용). */
  public boolean isFullyApproved(Long challengeWorkoutId) {
    return indoorRunApprovalRepository.findAllByChallengeWorkoutId(challengeWorkoutId).stream()
        .allMatch(a -> Boolean.TRUE.equals(a.getApproved()));
  }

  /** 전원 승인 시 호출 — 거리를 레이스 멤버 기록에 반영한다.
   * 동시 투표로 중복 호출될 수 있으므로 이미 APPROVED인 경우 skip(멱등성 보장). */
  @Transactional
  public void applyApprovedIndoorRun(Long challengeWorkoutId) {
    ChallengeWorkout cw = challengeWorkoutRepository.findById(challengeWorkoutId)
        .orElseThrow(() -> ApiException.notFound("challenge_workout_not_found"));

    // 동시 투표로 이미 처리된 경우 — 거리 이중 반영 방지
    if (cw.getApprovalStatus() == ApprovalStatus.APPROVED) return;

    cw.approve();
    challengeWorkoutRepository.save(cw);

    Challenge challenge = cw.getChallenge();
    UUID userId = cw.getUser().getId();
    BigDecimal distanceKm = Distance.toKm(cw.getAppliedDistanceM());
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

    return pending.stream()
        .map(cw -> toPendingResponse(cw, votesByWorkout.getOrDefault(cw.getId(), List.of()), viewerUserId))
        .toList();
  }

  private PendingApprovalResponse toPendingResponse(
      ChallengeWorkout cw, List<IndoorRunApproval> votes, UUID viewerUserId) {
    WorkoutSession ws = cw.getWorkoutSession();
    VoteTally tally = VoteTally.of(votes, viewerUserId);
    return new PendingApprovalResponse(
        cw.getId(),
        ws.getId(),
        cw.getUser().getNickname(),
        ws.getDistanceM(),
        ws.getDurationSec(),
        ws.getAvgPaceSecPerKm(),
        ws.getImageUrl(),
        IsoTime.format(ws.getStartedAt()),
        tally.myVote(),
        tally.canVote(),
        tally.total(),
        tally.approvedCount());
  }

  /** 한 실내러닝에 대한 투표 집계 — 뷰어 관점(내 투표·투표권 여부) 포함. */
  private record VoteTally(int total, int approvedCount, Boolean myVote, boolean canVote) {
    static VoteTally of(List<IndoorRunApproval> votes, UUID viewerUserId) {
      int approved = (int) votes.stream().filter(v -> Boolean.TRUE.equals(v.getApproved())).count();
      boolean canVote = votes.stream().anyMatch(v -> v.getVoter().getId().equals(viewerUserId));
      Boolean myVote = canVote
          ? votes.stream()
              .filter(v -> v.getVoter().getId().equals(viewerUserId))
              .findFirst()
              .map(IndoorRunApproval::getApproved)
              .orElse(null)
          : null;
      return new VoteTally(votes.size(), approved, myVote, canVote);
    }
  }

  /** 레이스의 거부된 실내러닝 목록. */
  @Transactional(readOnly = true)
  public List<RejectedApprovalResponse> getRejectedApprovals(Long challengeId) {
    List<ChallengeWorkout> rejected = challengeWorkoutRepository
        .findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(challengeId, ApprovalStatus.REJECTED);

    Map<Long, List<IndoorRunApproval>> votesByWorkout = votesByChallengeWorkout(rejected);

    return rejected.stream()
        .map(cw -> toRejectedResponse(cw, votesByWorkout.getOrDefault(cw.getId(), List.of())))
        .toList();
  }

  private RejectedApprovalResponse toRejectedResponse(ChallengeWorkout cw, List<IndoorRunApproval> votes) {
    WorkoutSession ws = cw.getWorkoutSession();
    List<String> rejectorNicknames = votes.stream()
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
        IsoTime.format(ws.getStartedAt()),
        rejectorNicknames);
  }

  /** 여러 ChallengeWorkout의 투표를 한 번의 쿼리로 조회해 workoutId별로 묶는다(N+1 방지). */
  private Map<Long, List<IndoorRunApproval>> votesByChallengeWorkout(List<ChallengeWorkout> workouts) {
    if (workouts.isEmpty()) return Map.of();
    List<Long> ids = workouts.stream().map(ChallengeWorkout::getId).toList();
    return indoorRunApprovalRepository.findAllByChallengeWorkoutIdIn(ids).stream()
        .collect(Collectors.groupingBy(a -> a.getChallengeWorkout().getId()));
  }
}
