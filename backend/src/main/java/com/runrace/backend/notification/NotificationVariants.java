package com.runrace.backend.notification;

import java.util.concurrent.ThreadLocalRandom;

/** 알림 문구 랜덤 변형 선택 — messages*.properties의 {prefix}0~{count-1} 키와 대응. */
final class NotificationVariants {
  private NotificationVariants() {}

  static String randomKey(String prefix, int count) {
    return prefix + ThreadLocalRandom.current().nextInt(count);
  }
}
