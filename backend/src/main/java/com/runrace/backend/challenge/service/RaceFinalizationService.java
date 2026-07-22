package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.event.ChallengeEvents.ChallengeEndedEvent;
import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

/**
 * 레이스 종료 확정과 순위·우승자 결정 전담.
 * 순위/우승자 계산은 순수 함수(정적)로, DB 반영·이벤트 발행은 인스턴스 메서드로 분리해
 * 핵심 규칙을 단위 테스트할 수 있게 한다.
 * 기간 만료 경로({@link ChallengeService#processRaceLifecycle})와
 * 전원 완주 경로({@link ChallengeProgressService})가 공통으로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class RaceFinalizationService {
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ApplicationEventPublisher eventPublisher;

  /**
   * 레이스 결과 순위: 완주자 우선(완주 시각 빠른 순) → 미완주는 누적 km 내림차순.
   * 종료 시 final_rank 부여와 화면 표시 순서의 단일 기준.
   */
  public static final Comparator<ChallengeMember> RACE_RESULT_ORDER =
      (m1, m2) -> {
        boolean f1 = m1.getFinishedAt() != null;
        boolean f2 = m2.getFinishedAt() != null;
        if (f1 && f2) return m1.getFinishedAt().compareTo(m2.getFinishedAt());
        if (f1) return -1;
        if (f2) return 1;
        return m2.getTotalKm().compareTo(m1.getTotalKm());
      };

  /** 누적 거리 내림차순, 동률이면 먼저 완주한 멤버 우선(미완주는 후순위). */
  private static final Comparator<ChallengeMember> BY_DISTANCE_THEN_FINISH =
      Comparator.comparing(ChallengeMember::getTotalKm)
          .thenComparing(
              m -> m.getFinishedAt() == null ? OffsetDateTime.MAX : m.getFinishedAt(),
              Comparator.reverseOrder());

  // ── 순수 규칙(부작용 없음, 단위 테스트 대상) ──────────────────────

  /**
   * 표시·확정용 우승자 계산.
   * - 참여자 1명 이하면 대결 불성립 → null.
   * - 이미 확정된 승자가 있으면 그대로 사용(완주 시 onMemberProgress가 확정).
   * - 첫 완주자가 있으면 그 사람.
   * - 완주자 없이 기간이 종료(now &gt; endAt)됐으면 누적 거리 최상위 멤버(전원 0km이면 null).
   */
  static AppUser resolveWinner(
      Challenge challenge, List<ChallengeMember> members, OffsetDateTime now) {
    // 참여자가 1명뿐(방장 혼자)인 레이스는 대결이 성립하지 않으므로 우승자 없음.
    if (members.size() <= 1) {
      return null;
    }
    if (challenge.getWinner() != null) {
      return challenge.getWinner();
    }

    AppUser firstFinisher = firstFinisher(members);
    if (firstFinisher != null) {
      return firstFinisher;
    }

    // 완주자 없이 기간이 종료됐으면 누적 거리 최상위 멤버.
    boolean timeEnded = challenge.getEndAt() != null && now.isAfter(challenge.getEndAt());
    return timeEnded ? topByDistance(members) : null;
  }

  /** 가장 먼저 완주한 멤버의 사용자, 완주자가 없으면 null. */
  static AppUser firstFinisher(List<ChallengeMember> members) {
    return members.stream()
        .filter(m -> m.getFinishedAt() != null)
        .min(Comparator.comparing(ChallengeMember::getFinishedAt))
        .map(ChallengeMember::getUser)
        .orElse(null);
  }

  /** 실제로 뛴(거리>0) 멤버가 한 명이라도 있는지 — 순위 부여·승자 성립 여부를 가른다. */
  static boolean anyRan(List<ChallengeMember> members) {
    return members.stream().anyMatch(m -> m.getTotalKm().compareTo(BigDecimal.ZERO) > 0);
  }

  /**
   * 누적 거리(동률 시 완주 시각) 최상위 멤버의 사용자.
   * 모든 참여자의 거리가 0이면 대결이 성립하지 않으므로 null 반환.
   */
  static AppUser topByDistance(List<ChallengeMember> members) {
    if (!anyRan(members)) return null;
    return members.stream()
        .max(BY_DISTANCE_THEN_FINISH)
        .map(ChallengeMember::getUser)
        .orElse(null);
  }

  // ── DB 반영·이벤트(부작용) ───────────────────────────────────────

  /**
   * 기간(endAt)이 지난 레이스를 확정한다: 상태 ENDED + 우승자 영속화.
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다. 확정했으면 true.
   */
  public boolean finalizeIfTimeEnded(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded()) return false;
    if (challenge.getEndAt() == null || !now.isAfter(challenge.getEndAt())) return false;
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(challenge.getId());
    finalizeRace(challenge, members, resolveWinner(challenge, members, now));
    return true;
  }

  /**
   * 레이스 종료 확정 공통 처리 — 종료 전이 + (실제로 뛴 사람이 있을 때만) 최종 순위 + 종료 이벤트 발행 + 저장.
   * 우승자는 호출부가 결정해 넘긴다(완주 1등 또는 기간 만료 시 표시용 우승자).
   */
  void finalizeRace(Challenge challenge, List<ChallengeMember> members, AppUser winner) {
    challenge.end();
    if (winner != null) challenge.declareWinner(winner);
    // 아무도 0km이면 순위 미부여 → head-to-head 전적에 반영되지 않는다.
    if (anyRan(members)) {
      assignFinalRanks(members);
    }
    challengeRepository.save(challenge);
    eventPublisher.publishEvent(new ChallengeEndedEvent(
        challenge.getId(),
        winner != null ? winner.getNickname() : null,
        members.stream().map(m -> m.getUser().getId()).toList()));
  }

  /**
   * 종료 시 확정 순위(final_rank)를 1부터 부여하고 저장한다({@link #RACE_RESULT_ORDER} 기준).
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다.
   */
  public void assignFinalRanks(List<ChallengeMember> members) {
    List<ChallengeMember> ordered = members.stream().sorted(RACE_RESULT_ORDER).toList();
    int rank = 1;
    for (ChallengeMember m : ordered) {
      if (m.getTotalKm().compareTo(java.math.BigDecimal.ZERO) > 0) {
        m.assignFinalRank(rank++);
      }
      // totalKm == 0 이면 finalRank를 null로 유지 (참여했지만 기록 없음)
    }
    challengeMemberRepository.saveAll(ordered);
  }

  /** 확정 순위를 초기화한다(레이스 되돌림 — 운동 삭제로 종료가 풀릴 때). */
  public void clearFinalRanks(Long challengeId) {
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(challengeId);
    for (ChallengeMember m : members) {
      m.clearFinalRank();
    }
    challengeMemberRepository.saveAll(members);
  }
}
