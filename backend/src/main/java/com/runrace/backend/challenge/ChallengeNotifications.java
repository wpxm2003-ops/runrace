package com.runrace.backend.challenge;

import com.runrace.backend.analytics.AnalyticsService;
import com.runrace.backend.push.PushService;
import java.util.concurrent.ThreadLocalRandom;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 대결 도메인의 부가 효과(분석·푸시)를 처리한다.
 *
 * <p>트랜잭션 커밋 이후에만 동작하므로, 롤백된 대결에 대해 알림이 나가지 않는다.
 * 새 트랜잭션({@code REQUIRES_NEW})에서 멤버를 다시 조회한다.
 */
@Component
@RequiredArgsConstructor
public class ChallengeNotifications {
  private final ChallengeMemberRepository challengeMemberRepository;
  private final PushService pushService;
  private final AnalyticsService analyticsService;

  private static final String[] MILESTONE_50 = {
    "%s님이 목표의 절반을 달성했어요! 서두르세요! 🏃",
    "%s님이 50%%를 돌파했어요! 따라잡을 시간이에요! ⚡",
    "%s님의 페이스가 심상치 않아요. 지금 달리세요! 🔥",
    "%s님이 중간 지점을 넘었어요. 추격하세요! 💨",
    "%s님이 벌써 반이나 달렸어요. 당신은요? 🤔",
    "경고! %s님이 속도를 올리고 있어요. 가만히 있을 건가요? 😤",
    "%s님이 이미 절반이에요. 소파에서 일어나세요! 🛋️",
    "반환점을 돈 %s님, 이제 당신 차례예요! 🔔",
    "%s님이 50%% 달성! 지금 안 달리면 후회해요 👟",
    "잠깐, %s님이 당신보다 훨씬 앞서 있어요! 😱",
  };

  private static final String[] MILESTONE_80 = {
    "%s님이 80%%에 도달했어요! 얼마 남지 않았어요! 🚨",
    "%s님이 결승선에 가까워지고 있어요. 전력 질주하세요! ⚠️",
    "%s님이 80%% 돌파! 지금이 마지막 기회예요! 🏁",
    "%s님이 거의 다 왔어요! 포기하지 마세요! 😱",
    "비상! %s님이 80%%를 넘었어요. 지금 당장 뛰세요! 🆘",
    "%s님이 코앞이에요. 이대로 지는 건 자존심 상하지 않나요? 😠",
    "80%% 달성한 %s님… 당신은 아직 준비도 안 됐나요? 💀",
    "%s님이 거의 골인 직전이에요. 지금 아니면 없어요! ⏰",
    "이러다 %s님한테 진다고요?! 지금 뛰세요!! 🔴",
    "%s님이 80%%! 역전은 지금뿐이에요. 신발 끈 묶어요! 👟",
  };

  private static final String[] OVERTAKE = {
    "%s님에게 순위를 빼앗겼어요! 반격할 시간이에요! 📢",
    "%s님이 당신을 추월했어요. 아직 늦지 않았어요! 🔄",
    "%s님에게 뒤처졌어요. 지금 달리면 따라잡을 수 있어요! 💪",
    "%s님이 치고 올라왔어요. 자리를 지키세요! ⚡",
    "방금 %s님에게 순위를 내줬어요. 이대로 괜찮아요? 😤",
    "%s님이 당신을 추월하고 웃으며 달려가고 있어요! 😆",
    "아차! %s님이 슬그머니 앞질러갔어요. 반격하세요! 🏹",
    "%s님한테 밀렸어요. 지금 바로 달리지 않으면 더 밀려요! 📉",
    "순위 변동! %s님이 당신을 제쳤어요. 자존심 회복할 시간이에요 🔥",
    "%s님이 추월했어요. 이 알림 받는 동안에도 멀어지고 있다고요! 🚀",
  };

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onChallengeCreated(ChallengeCreatedEvent event) {
    analyticsService.track(
        event.creatorUserId(), "challenge.created", "{\"challengeId\":" + event.challengeId() + "}");

    challengeMemberRepository.findAllForChallenge(event.challengeId()).stream()
        .map(member -> member.getUser().getId())
        .filter(userId -> !userId.equals(event.creatorUserId()))
        .forEach(userId -> pushService.sendToUserTokens(userId, "RunRace", "새 대결이 생성됐어요."));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onMilestoneReached(MilestoneReachedEvent event) {
    String[] pool = event.milestonePercent() >= 80 ? MILESTONE_80 : MILESTONE_50;
    String body = String.format(randomFrom(pool), event.achieverNickname());
    event.otherMemberIds().forEach(userId ->
        pushService.sendToUserTokens(userId, "RunRace 대결", body));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void onRankOvertake(RankOvertakeEvent event) {
    String body = String.format(randomFrom(OVERTAKE), event.overtakerNickname());
    event.overtakenUserIds().forEach(userId ->
        pushService.sendToUserTokens(userId, "RunRace 대결", body));
  }

  private static String randomFrom(String[] pool) {
    return pool[ThreadLocalRandom.current().nextInt(pool.length)];
  }
}
