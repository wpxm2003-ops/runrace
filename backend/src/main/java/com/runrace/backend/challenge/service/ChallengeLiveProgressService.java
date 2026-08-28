package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.dto.ChallengeLiveGaps;
import com.runrace.backend.challenge.dto.LiveProgressResponse;
import com.runrace.backend.challenge.dto.RivalGapRow;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.Distance;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 러닝 도중(정지·저장 전) 잠정 진행률(live_km) 반영 — 표시 전용, 완주·우승자·경품 판정에는
 * 절대 관여하지 않는다. 확정 반영은 {@link ChallengeProgressService}의 몫이며, 그 경로가
 * total_km을 반영하는 순간 이 값을 리셋해 이중합산을 막는다.
 *
 * <p>이 경로는 레이스 행 잠금을 잡지 않는다(표시 전용 값에 잠금은 과하다). 대신 확정 경로와의
 * 경합은 {@link ChallengeMemberRepository#updateLiveProgress} 한 곳에서 처리한다 — 라이브 컬럼만
 * 쓰는 벌크 UPDATE + total_km 낙관적 검사 + 요청 순서 토큰. 자세한 이유는 그 메서드의 주석 참조.
 */
@Service
@RequiredArgsConstructor
public class ChallengeLiveProgressService {

  /**
   * 라이브 진행률에 허용하는 최대 평균 속도(m/s) — 프론트 workoutTrack.ts의 탈것(vehicle) 판정 중
   * "confirmed"(경로·거리 기록 완전 중단, ~23km/h) 임계값인 CONFIRMED_SPEED_MS=6.5와 맞춘다.
   * WorkoutService는 완주 시점 단건 입력만 검증하고 구간 속도 임계값은 두지 않으므로, 프론트의
   * 기존 치팅 판정 기준을 그대로 재사용한다(새 임의 숫자를 만들지 않기 위함).
   */
  private static final double MAX_LIVE_SPEED_MPS = 6.5;

  /**
   * 순서 토큰이 서버 시각보다 앞서도 되는 한도(ms). 기기 시계 오차를 흡수할 만큼은 넉넉하되,
   * 잘못된 값이 저장돼도 이 시간 안에 스스로 풀리도록 짧게 잡는다.
   */
  private static final long MAX_SENT_AT_FUTURE_SKEW_MS = 5 * 60 * 1000L;

  private final ChallengeMemberRepository challengeMemberRepository;
  private final RivalRepository rivalRepository;
  private final WorkoutSessionRepository workoutSessionRepository;

  /** 구버전 앱·기존 내부 호출 호환. 런 식별자가 없으면 기존 순서 토큰 방어만 적용한다. */
  @Transactional
  public LiveProgressResponse submit(
      UUID userId, int distanceM, int elapsedSec, long sentAt) {
    return submit(userId, distanceM, elapsedSec, sentAt, null);
  }

  @Transactional
  public LiveProgressResponse submit(
      UUID userId, int distanceM, int elapsedSec, long sentAt, UUID clientWorkoutId) {
    validateInput(distanceM, elapsedSec, sentAt);

    // 확정 저장이 끝난 런의 지각 핑은 표시값에 다시 얹지 않는다. 아래 UPDATE에도 같은 조건을
    // 넣는다 — 이 조회 직후 저장 트랜잭션이 커밋되는 경합 창까지 닫으려면 둘 다 필요하다.
    if (clientWorkoutId != null
        && workoutSessionRepository.existsByUserIdAndClientWorkoutId(userId, clientWorkoutId)) {
      return new LiveProgressResponse(List.of());
    }

    OffsetDateTime now = OffsetDateTime.now();
    // 정렬은 findAllActiveForUser가 id 오름차순으로 보장한다(잠금 순서 계약 — 확정 경로와 같은
    // 순서로 잠가야 교착이 나지 않는다). 여기서 다시 정렬하지 않는다.
    List<ChallengeMember> activeMembers =
        challengeMemberRepository.findAllActiveForUser(userId, now);
    if (activeMembers.isEmpty()) {
      return new LiveProgressResponse(List.of());
    }
    // 탈퇴한 계정의 핑은 반영하지 않는다. 자체 JWT는 폐기 목록이 없고 만료가 7일이라, 다른
    // 기기에서 탈퇴해도 러닝 중인 기기의 핑이 계속 통과해 탈퇴 정리(clearLiveProgressForUser)가
    // 지운 값을 되살린다 — 닉네임 없는 계정이 "지금 뛰는 중"으로 남는다.
    if (activeMembers.get(0).getUser().getWithdrawnAt() != null) {
      return new LiveProgressResponse(List.of());
    }

    List<Long> challengeIds = activeMembers.stream().map(m -> m.getChallenge().getId()).toList();
    // 격차에 필요한 건 내가 등록한 라이벌뿐이다. 로스터 전체를 읽으면 핑 한 번이 참여 중인
    // 모든 레이스의 참가자 수만큼(대형 레이스면 수천 행) 읽고 대부분 버린다. 라이벌이 없으면
    // 조회 자체를 건너뛴다 — 대다수 사용자가 여기에 해당한다.
    Set<UUID> rivalIds = new HashSet<>(rivalRepository.findRivalUserIds(userId));
    Map<Long, List<ChallengeMember>> rivalsByChallenge = rivalIds.isEmpty()
        ? Map.of()
        : challengeMemberRepository
            .findAllByChallengeIdInAndUserIdIn(challengeIds, rivalIds).stream()
            .collect(Collectors.groupingBy(m -> m.getChallenge().getId()));

    BigDecimal distanceKm = Distance.toKm(distanceM);
    List<ChallengeLiveGaps> results = new ArrayList<>();

    // 러닝 시작부터의 평균 속도가 불가능하면 이번 값은 저장하지 않는다(첫 핑도 이 검사를 받는다 —
    // 이전 핑과의 델타만 보면 비교 대상이 없는 첫 핑이 무검증으로 통과한다). 조용히 넘길 뿐
    // 에러로 만들지는 않는다 — GPS 튐으로 잠깐 부푼 정직한 사용자의 배너까지 죽일 이유가 없고,
    // 반영하지 않는 것만으로 방어는 끝난다.
    boolean plausibleOverall = (double) distanceM / elapsedSec <= MAX_LIVE_SPEED_MPS;

    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      AppUser caller = member.getUser();
      boolean isPublicRace = challenge.getCrewId() == null;
      // 두 축 모두 기본 켜짐이고 각각 끌 수 있다.
      boolean shareAllowed =
          isPublicRace ? caller.isLivePublicOptIn() : caller.isLiveCrewEnabled();
      // 라이브가 목표를 넘겨 진행률을 밀어 올리지 못하게 남은 거리만큼으로 자른다. 상대의
      // effectiveTotalKm은 이미 잘린 값이 저장돼 있으므로, 내 쪽도 같은 기준으로 잘라야
      // 둘 다 목표를 넘긴 순간 격차가 어긋나지 않는다.
      BigDecimal cappedKm = capToGoal(distanceKm, member);
      if (!shareAllowed) {
        // 공유를 끈 뒤에도, 설정 변경 직전 스냅샷을 읽은 핑이 뒤늦게 값을 되살릴 수 있다.
        // 여기서 매번 지워 두면 그 창이 다음 핑까지(최대 한 주기)로 줄어든다.
        // 반드시 이 행만 지운다 — 사용자 단위로 지우면 공개는 끄고 크루는 켠 사용자의
        // 크루 값이 같은 루프 안에서 함께 날아간다.
        //
        // 지울 게 있을 때만 쿼리를 낸다. 이미 빈 행이면 0행 UPDATE라도 SQL 실행·인덱스 탐색·
        // DB 왕복은 그대로 든다. 필요한 값은 이미 로드돼 있으니 메모리에서 먼저 거른다
        // (쿼리의 같은 조건은 동시 변경 방어용으로 남겨 둔다).
        if (hasLiveState(member)) {
          challengeMemberRepository.discardLiveProgressForMember(member.getId(), sentAt);
        }
      } else if (plausibleOverall) {
        applyLiveIfPlausible(member, cappedKm, now, sentAt, clientWorkoutId);
      }

      // 내 쪽도 상대와 같은 기준(레이스 누적 + 이번 런)이어야 한다. 이번 런 거리만 쓰면
      // 이미 누적 기록이 있는 사람은 격차가 그 누적분만큼 통째로 틀린다.
      //
      // 상한(cappedKm)을 함께 쓴다 — 리더보드에 보이는 값이 잘린 값이라, 여기서 안 자르면
      // 배너가 남들 화면보다 큰 리드를 말한다. 대신 목표를 넘긴 뒤로는 격차가 더 움직이지
      // 않는데, 그 시점엔 이미 완주한 상태라 배너의 의미도 사라진다.
      long myEffectiveM = Distance.toM(member.getTotalKm().add(cappedKm));

      // 이미 라이벌만 조회했으므로 여기서 다시 거르지 않는다. 자기 제외 필터도 뺐다 —
      // 자기 자신은 라이벌로 등록할 수 없다(RivalService의 cannot_add_self).
      List<ChallengeMember> rivals = rivalsByChallenge.getOrDefault(challenge.getId(), List.of());
      List<RivalGapRow> gaps = rivals.stream()
          .map(m -> new RivalGapRow(
              m.getUser().getId(),
              m.getUser().getNickname(),
              myEffectiveM - Distance.toM(
                  m.sharesLive(!isPublicRace) ? m.effectiveTotalKm(now) : m.getTotalKm())))
          .toList();
      results.add(new ChallengeLiveGaps(challenge.getId(), gaps));
    }

    return new LiveProgressResponse(results);
  }

  /**
   * 라이브 값을 일시정지 상태로 표시한다 — 거리는 유지하고 "러닝 중" 표시에서만 뺀다.
   * 운동 일시정지(수동·방치 자동)와 종료에서 호출한다. 다음 핑이 오면 자동으로 풀린다.
   */
  @Transactional
  public void pause(UUID userId, long sentAt) {
    validateSentAt(sentAt);
    forEachActiveMember(userId, m -> challengeMemberRepository
        .pauseLiveProgressForMember(m.getId(), sentAt));
  }

  /**
   * 라이브 값을 즉시 지운다 — 이번 런을 저장하지 않기로 확정된 순간에만 쓴다.
   * 일시정지({@link #pause})와 달리 거리를 남기지 않는다: 저장되지 않을 거리를 남겨 두면
   * 신선도 윈도(15분) 동안 표시되다가 뒤늦게 떨어진다.
   */
  @Transactional
  public void discard(UUID userId, long sentAt) {
    validateSentAt(sentAt);
    forEachActiveMember(userId, m -> challengeMemberRepository
        .discardLiveProgressForMember(m.getId(), sentAt));
  }

  /**
   * 지금 라이브가 붙을 수 있는 행(활성 레이스 참여)만, 핑 경로와 같은 id 오름차순으로 순회한다.
   * 사용자 단위 벌크 UPDATE로 하면 평생 참여한 모든 행을 건드리고, ORDER BY가 없어 핑 경로가
   * 지키는 잠금 순서 계약을 깨 교착을 만든다.
   */
  private void forEachActiveMember(UUID userId, java.util.function.Consumer<ChallengeMember> body) {
    // 조회가 id 오름차순을 보장하므로 그대로 순회한다(잠금 순서 계약).
    challengeMemberRepository.findAllActiveForUser(userId, OffsetDateTime.now()).forEach(body);
  }

  /**
   * 순서 토큰의 상한 검증. 이 값은 이후 모든 요청의 고수위로 저장되므로, 시계가 크게 앞선
   * 기기가 한 번만 보내도 그 시각이 될 때까지 이후 핑·일시정지·삭제가 전부 거부된다.
   * 과거 방향은 막을 필요가 없다 — 고수위보다 작으면 그냥 반영되지 않을 뿐 오염되지 않는다.
   */
  private static void validateSentAt(long sentAt) {
    if (sentAt <= 0 || sentAt > System.currentTimeMillis() + MAX_SENT_AT_FUTURE_SKEW_MS) {
      throw ApiException.badRequest("sent_at_invalid");
    }
  }

  /** 구조적으로 말이 안 되는 입력만 거부한다. 속도 타당성은 저장 여부로만 갈린다(조용히 skip). */
  private static void validateInput(int distanceM, int elapsedSec, long sentAt) {
    validateSentAt(sentAt);
    if (distanceM < 0 || distanceM > Distance.MAX_DISTANCE_M) {
      throw ApiException.badRequest("distance_invalid");
    }
    // 상한은 확정 저장(WorkoutService)과 같은 기준을 쓴다. 상한이 없으면 아주 긴 경과를
    // 불러 평균 속도 검증을 통째로 무력화할 수 있다.
    if (elapsedSec < 1 || elapsedSec > Distance.MAX_DURATION_SEC) {
      throw ApiException.badRequest("duration_invalid");
    }
  }

  /**
   * 이전 live_km/live_updated_at 대비 이번 값이 물리적으로 불가능한 페이스를 내포하면
   * 조용히 무시한다(에러 없음). 거리가 줄어든 경우(저장 없이 새 러닝을 시작하는 등 정당한
   * 감소)는 그대로 반영한다 — 빠른 증가만 검증 대상이다.
   *
   * <p>실제 쓰기는 라이브 컬럼만 건드리는 벌크 UPDATE로 한다. 엔티티를 변경하면 트랜잭션 커밋 시
   * 전체 컬럼 UPDATE가 나가 확정 경로가 올린 total_km을 덮어쓸 수 있다.
   */
  private void applyLiveIfPlausible(
      ChallengeMember member, BigDecimal distanceKm, OffsetDateTime now, long sentAt,
      UUID clientWorkoutId) {
    BigDecimal prevKm = member.getLiveKm();
    OffsetDateTime prevAt = member.getLiveUpdatedAt();
    if (prevKm != null && prevAt != null) {
      BigDecimal deltaKm = distanceKm.subtract(prevKm);
      if (deltaKm.signum() > 0) {
        long elapsedSec = Duration.between(prevAt, now).getSeconds();
        if (elapsedSec <= 0) {
          return; // 경과 시간 없이 거리만 증가 — 무한 속도이므로 불가능한 페이스로 간주
        }
        double speedMps = deltaKm.doubleValue() * 1000.0 / elapsedSec;
        if (speedMps > MAX_LIVE_SPEED_MPS) {
          return; // 물리적으로 불가능한 페이스 — 반영하지 않고 조용히 skip
        }
      }
    }
    // 더 나중에 만들어진 요청(종료 시 일시정지 등)이 이미 반영됐으면 쿼리가 떨군다.
    if (clientWorkoutId == null) {
      challengeMemberRepository.updateLiveProgress(
          member.getId(), distanceKm, now, member.getTotalKm(), sentAt);
    } else {
      challengeMemberRepository.updateLiveProgress(
          member.getId(), distanceKm, now, member.getTotalKm(), sentAt, clientWorkoutId);
    }
  }

  /** 지울 라이브 상태가 실제로 남아 있는지 — 빈 행에 0행 UPDATE를 날리지 않기 위한 사전 검사. */
  private static boolean hasLiveState(ChallengeMember member) {
    return member.getLiveKm() != null
        || member.getLiveUpdatedAt() != null
        || member.isLivePaused();
  }

  /**
   * 확정 누적 + 라이브가 목표를 넘지 않도록 자른다. 목표가 없는 레이스는 자르지 않는다.
   *
   * <p>잠정값으로 표시할 수 있는 최대치를 100%로 묶는 장치다 — 거리·경과시간이 모두
   * 클라이언트 주장값이라 조작된 큰 값이 들어올 수 있는데, 그 피해를 "100%로 보인다"에서
   * 멈춘다(목표 초과분은 확정 저장 경로가 처리한다).
   */
  private static BigDecimal capToGoal(BigDecimal km, ChallengeMember member) {
    BigDecimal goal = member.getChallenge().getGoalKm();
    if (goal == null || goal.signum() <= 0) {
      return km;
    }
    BigDecimal room = goal.subtract(member.getTotalKm()).max(BigDecimal.ZERO);
    return km.min(room);
  }
}
