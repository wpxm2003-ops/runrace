package com.runrace.backend.push.service;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import com.google.firebase.messaging.WebpushConfig;
import com.google.firebase.messaging.WebpushNotification;
import com.runrace.backend.push.domain.DeviceToken;
import com.runrace.backend.push.repository.DeviceTokenRepository;
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
  private final MessageSource messageSource;

  /**
   * 수신자 언어로 title/body 키를 렌더링해 전송한다. {0} 자리표시자는 직접 치환하므로
   * (MessageFormat 미사용) 영어·스페인어의 애포스트로피를 이스케이프하지 않아도 된다.
   *
   * @param arg {0}에 치환할 값(닉네임 등). 없으면 null.
   */
  public void sendLocalized(UUID userId, String titleKey, String bodyKey, String arg) {
    Locale locale = localeOf(userId);
    sendToUserTokens(userId, render(titleKey, locale, arg), render(bodyKey, locale, arg));
  }

  private Locale localeOf(UUID userId) {
    return Locale.forLanguageTag(appUserRepository.findLangCdById(userId).orElse("ko"));
  }

  private String render(String key, Locale locale, String arg) {
    String msg = messageSource.getMessage(key, null, locale);
    return arg == null ? msg : msg.replace("{0}", arg);
  }

  public void sendToUserTokens(UUID userId, String title, String body) {
    if (FirebaseApp.getApps().isEmpty()) return;
    List<DeviceToken> tokens = deviceTokenRepository.findAllByUserId(userId);
    for (DeviceToken t : tokens) {
      Message msg = buildMessage(t, title, body);
      try {
        FirebaseMessaging.getInstance().send(msg);
      } catch (FirebaseMessagingException e) {
        // 더 이상 유효하지 않은 토큰은 제거해 누적·재시도를 막는다. 그 외는 best-effort.
        if (isDeadToken(e.getMessagingErrorCode())) {
          deviceTokenRepository.delete(t);
        } else {
          log.warn(
              "FCM 전송 실패 (userId={}, platform={}, code={})",
              userId,
              t.getPlatform(),
              e.getMessagingErrorCode());
        }
      } catch (Exception e) {
        log.warn("FCM 전송 중 예외 (userId={}, platform={})", userId, t.getPlatform(), e);
      }
    }
  }

  private static Message buildMessage(DeviceToken token, String title, String body) {
    Message.Builder builder =
        Message.builder()
            .setToken(token.getFcmToken())
            .setNotification(Notification.builder().setTitle(title).setBody(body).build());

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
