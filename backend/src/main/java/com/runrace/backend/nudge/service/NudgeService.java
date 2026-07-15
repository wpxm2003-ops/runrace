package com.runrace.backend.nudge.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.service.ChallengeService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.event.NudgeEvents;
import com.runrace.backend.nudge.domain.Nudge;
import com.runrace.backend.nudge.repository.NudgeRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 콕 찌르기(독려) — 같은 레이스 참가자 또는 같은 크루 멤버끼리 서로 독려 푸시를 보낸다.
 * 별도의 친구 관계 없이, "진행 중인 레이스의 공동 참가자"/"같은 크루 소속"을 권한 게이트로 사용한다.
 * 일일 제한(보낸이→받는이 하루 1회)은 두 경로가 공유한다.
 */
@Service
@RequiredArgsConstructor
public class NudgeService {
  /** 프리셋 문구 개수 — messages.properties의 nudge.preset.0 ~ nudge.preset.{N-1}. */
  private static final int PRESET_COUNT = 4;
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final NudgeRepository nudgeRepository;
  private final ApplicationEventPublisher eventPublisher;

  /**
   * 진행 중인 레이스 {challengeId}에서 같은 참가자 {targetUserId}에게 콕 찌르기를 보낸다(하루 1회).
   * variant는 보낸 사람이 고른 프리셋 문구 인덱스(범위를 벗어나거나 null이면 0번).
   */
  @Transactional
  public void nudge(AuthPrincipal principal, Long challengeId, UUID targetUserId, Integer variant) {
    int preset = (variant != null && variant >= 0 && variant < PRESET_COUNT) ? variant : 0;
    UUID senderId = principal.userId();
    if (senderId.equals(targetUserId)) {
      throw ApiException.badRequest("cannot_nudge_self");
    }

    Challenge challenge = challengeRepository
        .findById(challengeId)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));

    OffsetDateTime now = OffsetDateTime.now();
    if (!ChallengeService.hasStarted(challenge, now) || ChallengeService.isEnded(challenge, now)) {
      throw ApiException.conflict("race_not_in_progress");
    }
    if (challengeMemberRepository.findByChallengeIdAndUserId(challengeId, senderId).isEmpty()) {
      throw ApiException.forbidden("forbidden");
    }
    if (challengeMemberRepository.findByChallengeIdAndUserId(challengeId, targetUserId).isEmpty()) {
      throw ApiException.notFound("not_member");
    }

    // 푸시 제목에 출처를 드러낸다 — 크루 내부 레이스면 "크루 레이스", 아니면 "레이스".
    String titleKey =
        challenge.getCrewId() != null ? "nudge.title.crew_race" : "nudge.title.race";
    deliver(senderId, targetUserId, preset, now, titleKey);
  }

  /**
   * 같은 크루 멤버 {targetUserId}에게 콕 찌르기를 보낸다(하루 1회 — 레이스 넛지와 공용 제한).
   * 크루 홈 주간 보드에서 이번 주 0km 멤버 독려용.
   */
  @Transactional
  public void crewNudge(AuthPrincipal principal, UUID targetUserId, Integer variant) {
    int preset = (variant != null && variant >= 0 && variant < PRESET_COUNT) ? variant : 0;
    UUID senderId = principal.userId();
    if (senderId.equals(targetUserId)) {
      throw ApiException.badRequest("cannot_nudge_self");
    }

    CrewMember mine = crewMemberRepository.findByUserId(senderId)
        .orElseThrow(() -> ApiException.forbidden("not_in_crew"));
    CrewMember target = crewMemberRepository.findByUserId(targetUserId)
        .orElseThrow(() -> ApiException.notFound("not_crew_mate"));
    if (!mine.getCrew().getId().equals(target.getCrew().getId())) {
      throw ApiException.forbidden("not_crew_mate");
    }

    deliver(senderId, targetUserId, preset, OffsetDateTime.now(), "nudge.title.crew");
  }

  /** 공통 발송 — 일일 제한 검사 + 저장 + 커밋 후 푸시 이벤트(titleKey로 출처 구분). */
  private void deliver(
      UUID senderId, UUID targetUserId, int preset, OffsetDateTime now, String titleKey) {
    OffsetDateTime startOfDay = LocalDate.now(KST).atStartOfDay(KST).toOffsetDateTime();
    if (nudgeRepository.existsBySenderIdAndReceiverIdAndSentAtGreaterThanEqual(
        senderId, targetUserId, startOfDay)) {
      throw ApiException.conflict("nudge_daily_limit");
    }

    AppUser sender = appUserRepository.getRequired(senderId);
    AppUser receiver = appUserRepository.getRequired(targetUserId);
    try {
      // exists 체크는 빠른 경로일 뿐 — 동시 요청은 DB 유니크 제약(sender,receiver,sent_on)으로 막는다.
      nudgeRepository.saveAndFlush(Nudge.builder()
          .sender(sender)
          .receiver(receiver)
          .message("preset:" + preset)
          .sentAt(now)
          .sentOn(LocalDate.now(KST))
          .build());
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      throw ApiException.conflict("nudge_daily_limit");
    }

    // 외부 푸시(FCM)는 DB 트랜잭션 밖에서 — 커밋 후 처리(NudgeNotifications).
    // 본문은 수신자 언어의 프리셋 문구로 렌더링한다.
    String senderNickname = sender.getNickname() != null ? sender.getNickname() : "친구";
    eventPublisher.publishEvent(
        new NudgeEvents.NudgeSent(
            receiver.getId(), senderNickname, titleKey, "nudge.preset." + preset));
  }
}
