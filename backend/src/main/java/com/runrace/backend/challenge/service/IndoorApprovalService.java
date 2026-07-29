package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.domain.IndoorRunApproval;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.Distance;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.RejectedApprovalResponse;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.workout.domain.WorkoutSession;
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
  private final ChallengeRepository challengeRepository;
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
      // 같은 레이스에 이미 등록된 운동이면 중복 승인 요청을 만들지 않는다
      if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(
          challenge.getId(), session.getId())) return;

      // 승인 대기 상태의 레이스-운동 링크 생성
      ChallengeWorkout saved = savePendingChallengeWorkout(challenge, session, member, distanceM, now);

      // 본인을 제외한 구성원에게 투표 행 생성
      List<UUID> voterIds = createApprovalVotes(saved, allMembers, userId, now);

      // 투표자가 없으면(혼자 참가 중) 즉시 승인
      if (voterIds.isEmpty()) {
        approveWithoutVote(saved);
      } else {
        String nickname = member.getUser().getNickname();
        eventPublisher.publishEvent(new WorkoutEvents.IndoorRunPendingApprovalEvent(
            saved.getId(), challenge.getId(), userId, voterIds, nickname));
      }
    });
  }

  private ChallengeWorkout savePendingChallengeWorkout(
      Challenge challenge, WorkoutSession session, ChallengeMember member,
      int distanceM, OffsetDateTime now) {
    return challengeWorkoutRepository.save(ChallengeWorkout.builder()
        .challenge(challenge)
        .workoutSession(session)
        .user(member.getUser())
        .appliedDistanceM(distanceM)
        .approvalStatus(ApprovalStatus.PENDING)
        .createdAt(now)
        .build());
  }

  /** 본인을 제외한 레이스 구성원의 투표 행을 만들고, 투표자 ID 목록을 돌려준다. */
  private List<UUID> createApprovalVotes(
      ChallengeWorkout saved, List<ChallengeMember> allMembers, UUID userId, OffsetDateTime now) {
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
    return voterIds;
  }

  /** 투표자가 없어 승인 절차를 건너뛰고 바로 거리까지 반영한다. */
  private void approveWithoutVote(ChallengeWorkout saved) {
    saved.approve();
    challengeWorkoutRepository.save(saved);
    applyApprovedIndoorRun(saved.getId());
  }

  /** 해당 ChallengeWorkout의 모든 투표가 승인 상태인지 — 전원 승인 판정(거리 반영 트리거용). */
  public boolean isFullyApproved(Long challengeWorkoutId) {
    return indoorRunApprovalRepository.findAllByChallengeWorkoutId(challengeWorkoutId).stream()
        .allMatch(a -> Boolean.TRUE.equals(a.getApproved()));
  }

  /** 전원 승인 시 호출 — 거리를 레이스 멤버 기록에 반영한다.
   * PENDING이 아니면 skip(동시 투표·재호출 멱등성). 이미 종료된 레이스면 거리·알림 반영 없이
   * REJECTED로 닫아 대기 목록에서만 내린다(순위·경품 결과 불변 유지).
   *
   * <p>이 멱등성은 {@link com.runrace.backend.workout.service.WorkoutService#voteIndoorRun}이
   * {@code findAllByWorkoutSessionIdForUpdate}로 대상 행에 PESSIMISTIC_WRITE 잠금을 걸어주는 덕에
   * 실제로 보장된다 — 각 투표 트랜잭션은 자기 차례에 잠금을 얻고 나서야 진행하므로,
   * 두 번째 트랜잭션이 여기 들어올 때는 이미 첫 번째가 반영한 APPROVED 상태를 정확히 본다.
   *
   * <p>같은 클래스의 {@link #approveWithoutVote}도 이 메서드를 부른다(self-invocation이라 프록시 미적용).
   * 전파가 기본값 REQUIRED라 어느 경로든 호출자의 트랜잭션에 합류하므로 동작은 동일하다 —
   * <b>단 여기를 REQUIRES_NEW 등으로 바꾸면 내부 호출 경로만 조용히 그 설정을 무시한다.</b> */
  @Transactional
  public void applyApprovedIndoorRun(Long challengeWorkoutId) {
    ChallengeWorkout cw = challengeWorkoutRepository.findById(challengeWorkoutId)
        .orElseThrow(() -> ApiException.notFound("challenge_workout_not_found"));

    // 동시 투표나 재호출로 이미 처리된 경우 — 거리 이중 반영·상태 재전이 방지
    if (cw.getApprovalStatus() != ApprovalStatus.PENDING) return;

    Long challengeId = cw.getChallenge().getId();
    UUID userId = cw.getUser().getId();
    BigDecimal distanceKm = Distance.toKm(cw.getAppliedDistanceM());
    OffsetDateTime now = OffsetDateTime.now();

    // 종료된 레이스의 순위·경품 결과는 불변이다. 마지막 승인이 늦게 도착한 실내런은
    // REJECTED 상태로 닫아 대기 목록에서 제거하되, 거리와 승인 알림은 반영하지 않는다.
    Challenge challenge = challengeRepository.findByIdForUpdate(challengeId)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
    if (ChallengeService.isEnded(challenge, now)) {
      cw.reject();
      challengeWorkoutRepository.save(cw);
      return;
    }

    cw.approve();
    challengeWorkoutRepository.save(cw);
    challengeProgressService.applyDistanceToMember(challengeId, userId, distanceKm, now);

    eventPublisher.publishEvent(new WorkoutEvents.IndoorRunApprovedEvent(challengeWorkoutId, userId));
  }

  /** 레이스 멤버만 승인 목록을 볼 수 있게 한다(비멤버 데이터 노출 차단). */
  private void requireMember(Long challengeId, UUID viewerUserId) {
    if (challengeMemberRepository.findByChallengeIdAndUserId(challengeId, viewerUserId).isEmpty()) {
      throw ApiException.forbidden("not_a_member");
    }
  }

  /** 레이스의 승인 대기 중인 실내러닝 목록. */
  @Transactional(readOnly = true)
  public List<PendingApprovalResponse> getPendingApprovals(Long challengeId, UUID viewerUserId) {
    requireMember(challengeId, viewerUserId);
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
  public List<RejectedApprovalResponse> getRejectedApprovals(Long challengeId, UUID viewerUserId) {
    requireMember(challengeId, viewerUserId);
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
