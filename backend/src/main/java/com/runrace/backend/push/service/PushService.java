package com.runrace.backend.push.service;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import com.google.firebase.messaging.WebpushConfig;
import com.google.firebase.messaging.WebpushNotification;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.domain.DeviceToken;
import com.runrace.backend.push.domain.SystemPushHistory;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PushService {
  private static final Logger log = LoggerFactory.getLogger(PushService.class);

  private final DeviceTokenRepository deviceTokenRepository;
  private final AppUserRepository appUserRepository;
  private final SystemPushHistoryRepository systemPushHistoryRepository;
  private final MessageSource messageSource;
  private final ErrorLogService errorLogService;

  /**
   * 수신자 언어로 title/body 키를 렌더링해 전송한다. {0} 자리표시자는 직접 치환하므로
   * (MessageFormat 미사용) 영어·스페인어의 애포스트로피를 이스케이프하지 않아도 된다.
   *
   * @param arg {0}에 치환할 값(닉네임 등). 없으면 null.
   */
  public void sendLocalized(UUID userId, String titleKey, String bodyKey, String arg) {
    send(userId, titleKey, bodyKey, null, null, arg);
  }

  /**
   * @param link 알림 탭 시 이동할 앱 내 경로(예: "/challenges/123"). 없으면 null.
   */
  public void sendLocalized(UUID userId, String titleKey, String bodyKey, String arg, String link) {
    send(userId, titleKey, bodyKey, link, null, arg);
  }

  /**
   * @param pushType 발송 유형 식별자(예: "streak_risk"). null이면 이력 미저장.
   */
  public void sendLocalized(UUID userId, String titleKey, String bodyKey, String arg, String link, String pushType) {
    send(userId, titleKey, bodyKey, link, pushType, arg);
  }

  /** {0}=arg0, {1}=arg1 두 인자 치환 — 라이벌 알림 등 복수 인자 메시지용. */
  public void sendLocalized(UUID userId, String titleKey, String bodyKey,
      String arg0, String arg1, String link, String pushType) {
    send(userId, titleKey, bodyKey, link, pushType, arg0, arg1);
  }

  /**
   * 발송 코어 — 가드·로케일·렌더·전송·이력 저장을 한 곳에 모은다.
   * title은 첫 인자({0})만, body는 모든 인자({0},{1},…)를 치환한다.
   */
  private void send(UUID userId, String titleKey, String bodyKey, String link, String pushType, String... args) {
    if (FirebaseApp.getApps().isEmpty()) return;
    if (!appUserRepository.findPushEnabledById(userId).orElse(true)) return;
    Locale locale = localeOf(userId);
    String title = render(titleKey, locale, args.length > 0 ? args[0] : null);
    String body = render(bodyKey, locale, args);
    int sent = sendToUserTokens(userId, title, body, link);
    // 토큰이 없어 실제로 한 건도 접수되지 않았으면 이력을 남기지 않는다.
    if (pushType != null && sent > 0) {
      systemPushHistoryRepository.save(SystemPushHistory.of(userId, pushType, title, body));
    }
  }

  private Locale localeOf(UUID userId) {
    return Locale.forLanguageTag(appUserRepository.findLangCdById(userId).orElse("ko"));
  }

  /** {i} 자리표시자를 args[i](non-null)로 치환. MessageFormat 미사용(애포스트로피 이스케이프 불필요). */
  private String render(String key, Locale locale, String... args) {
    String msg = messageSource.getMessage(key, null, locale);
    for (int i = 0; i < args.length; i++) {
      if (args[i] != null) msg = msg.replace("{" + i + "}", args[i]);
    }
    return msg;
  }

  /** @return FCM 접수에 성공한 토큰 수(실제 전송된 건수). 0이면 전송 대상 없음. */
  public int sendToUserTokens(UUID userId, String title, String body, String link) {
    if (FirebaseApp.getApps().isEmpty()) return 0;
    // 알림을 끈 사용자에게는 모든 푸시(이벤트·리텐션)를 보내지 않는다.
    if (!appUserRepository.findPushEnabledById(userId).orElse(true)) return 0;
    List<DeviceToken> tokens = deviceTokenRepository.findAllByUserId(userId);
    int sent = 0;
    for (DeviceToken t : tokens) {
      Message msg = buildMessage(t, title, body, link);
      try {
        FirebaseMessaging.getInstance().send(msg);
        sent++;
      } catch (FirebaseMessagingException e) {
        // 더 이상 유효하지 않은 토큰은 제거해 누적·재시도를 막는다. 그 외는 best-effort.
        String code = e.getMessagingErrorCode() != null ? e.getMessagingErrorCode().name() : "UNKNOWN";
        String ctx = "userId=" + userId + " platform=" + t.getPlatform();
        if (isDeadToken(e.getMessagingErrorCode())) {
          deviceTokenRepository.delete(t);
        } else {
          log.warn("FCM 전송 실패 (userId={}, platform={}, code={})", userId, t.getPlatform(), code);
          errorLogService.recordServiceError("push", code, e.getMessage(), null, ctx);
        }
      } catch (Exception e) {
        log.warn("FCM 전송 중 예외 (userId={}, platform={})", userId, t.getPlatform(), e);
        errorLogService.recordServiceError("push", e.getClass().getSimpleName(), e.getMessage(),
            ErrorLogService.stackTraceOf(e), "userId=" + userId + " platform=" + t.getPlatform());
      }
    }
    return sent;
  }

  private static Message buildMessage(DeviceToken token, String title, String body, String link) {
    Message.Builder builder =
        Message.builder()
            .setToken(token.getFcmToken())
            .setNotification(Notification.builder().setTitle(title).setBody(body).build());

    // 알림 탭 시 이동할 앱 내 경로 — 네이티브/웹 공통 data 페이로드로 전달
    if (link != null && !link.isBlank()) {
      builder.putData("link", link);
    }

    if (isWebPlatform(token.getPlatform())) {
      builder
          .putData("title", title)
          .putData("body", body)
          .setWebpushConfig(
              WebpushConfig.builder()
                  .setNotification(
                      WebpushNotification.builder().setTitle(title).setBody(body).build())
                  .putHeader("Urgency", "high")
                  .build());
    }
    return builder.build();
  }

  private static boolean isWebPlatform(String platform) {
    return platform != null && platform.startsWith("web");
  }

  private static boolean isDeadToken(MessagingErrorCode code) {
    return code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT;
  }
}
