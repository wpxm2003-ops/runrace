package com.runrace.backend.push.service;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.push.domain.DeviceToken;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 디바이스 토큰 upsert — 첫 토큰 등록 시에만 push_enabled를 켜는지 검증. */
@ExtendWith(MockitoExtension.class)
class DeviceTokenServiceTest {

  @Mock DeviceTokenRepository deviceTokenRepository;
  @Mock AppUserRepository appUserRepository;
  @InjectMocks DeviceTokenService service;

  private final UUID userId = UUID.randomUUID();

  @Test
  void 첫_토큰_등록이면_push_enabled를_켠다() {
    // 토큰이 하나도 없던 유저 + 이 플랫폼 토큰도 없음 → 신규 삽입 경로
    when(deviceTokenRepository.existsByUserId(userId)).thenReturn(false);
    when(deviceTokenRepository.findByUserIdAndPlatform(userId, "android")).thenReturn(Optional.empty());

    service.upsert(userId, "android", "tok-1");

    verify(appUserRepository).enablePush(userId);
  }

  @Test
  void 같은_플랫폼_재등록이면_push_enabled를_건드리지_않는다() {
    // 앱 콜드스타트마다 발생하는 재등록 — 기존 행 갱신 경로. opt-out을 덮어쓰면 안 된다.
    when(deviceTokenRepository.existsByUserId(userId)).thenReturn(true);
    when(deviceTokenRepository.findByUserIdAndPlatform(userId, "android"))
        .thenReturn(Optional.of(DeviceToken.builder().platform("android").fcmToken("old").build()));

    service.upsert(userId, "android", "tok-2");

    verify(appUserRepository, never()).enablePush(userId);
  }

  @Test
  void 이미_토큰이_있는_유저의_추가_플랫폼_등록은_push_enabled를_건드리지_않는다() {
    // 다른 플랫폼(예: web) 토큰이 이미 있는 유저가 새 플랫폼을 등록 — 신규 삽입이지만 firstToken은 아님.
    when(deviceTokenRepository.existsByUserId(userId)).thenReturn(true);
    when(deviceTokenRepository.findByUserIdAndPlatform(userId, "android")).thenReturn(Optional.empty());

    service.upsert(userId, "android", "tok-3");

    verify(appUserRepository, never()).enablePush(userId);
  }
}
