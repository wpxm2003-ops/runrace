package com.runrace.backend.push;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PushService {
  private static final Logger log = LoggerFactory.getLogger(PushService.class);

  private final DeviceTokenRepository deviceTokenRepository;

  public void sendToUserTokens(UUID userId, String title, String body) {
    if (FirebaseApp.getApps().isEmpty()) return;
    List<DeviceToken> tokens = deviceTokenRepository.findAllByUserId(userId);
    for (DeviceToken t : tokens) {
      Message msg =
          Message.builder()
              .setToken(t.getFcmToken())
              .setNotification(Notification.builder().setTitle(title).setBody(body).build())
              .build();
      try {
        FirebaseMessaging.getInstance().send(msg);
      } catch (FirebaseMessagingException e) {
        // 더 이상 유효하지 않은 토큰은 제거해 누적·재시도를 막는다. 그 외는 best-effort.
        if (isDeadToken(e.getMessagingErrorCode())) {
          deviceTokenRepository.delete(t);
        } else {
          log.warn("FCM 전송 실패 (userId={}, code={})", userId, e.getMessagingErrorCode());
        }
      } catch (Exception e) {
        log.warn("FCM 전송 중 예외 (userId={})", userId, e);
      }
    }
  }

  private static boolean isDeadToken(MessagingErrorCode code) {
    return code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT;
  }
}
