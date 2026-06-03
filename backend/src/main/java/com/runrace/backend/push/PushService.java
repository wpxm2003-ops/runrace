package com.runrace.backend.push;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.Notification;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PushService {
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
      } catch (Exception ignored) {
        // MVP: best-effort
      }
    }
  }
}

