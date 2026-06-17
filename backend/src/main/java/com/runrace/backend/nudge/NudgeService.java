package com.runrace.backend.nudge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.service.ChallengeService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 콕 찌르기(독려) — 같은 레이스에 참가 중인 멤버끼리 서로 독려 푸시를 보낸다.
 * 별도의 친구 관계 없이, "진행 중인 레이스의 공동 참가자"를 권한 게이트로 사용한다.
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
        new NudgeEvents.NudgeSent(receiver.getId(), senderNickname, "nudge.preset." + preset));
  }
}
