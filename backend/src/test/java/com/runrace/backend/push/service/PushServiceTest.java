package com.runrace.backend.push.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.domain.DeviceToken;
import com.runrace.backend.push.domain.SystemPushHistory;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;

@ExtendWith(MockitoExtension.class)
class PushServiceTest {

  @Mock DeviceTokenRepository deviceTokenRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock SystemPushHistoryRepository systemPushHistoryRepository;
  @Mock MessageSource messageSource;
  @Mock ErrorLogService errorLogService;
  @Mock FirebaseMessaging firebaseMessaging;

  @InjectMocks PushService service;

  private final UUID userId = UUID.randomUUID();

  private DeviceToken token(String platform, String fcmToken) {
    return DeviceToken.builder()
        .id(UUID.randomUUID())
        .platform(platform)
        .fcmToken(fcmToken)
        .updatedAt(OffsetDateTime.now())
        .build();
  }

  /** FirebaseApp.getApps()를 구성됨 상태로 스텁 — 대부분 테스트의 공통 전제. */
  private MockedStatic<FirebaseApp> appConfigured() {
    MockedStatic<FirebaseApp> app = mockStatic(FirebaseApp.class);
    app.when(FirebaseApp::getApps).thenReturn(List.of(mock(FirebaseApp.class)));
    return app;
  }

  // ── Firebase 미구성 ──────────────────────────────────────────────

  @Nested class FirebaseNotConfigured {
    @Test void sendLocalized_앱없으면_아무것도안함() {
      try (MockedStatic<FirebaseApp> app = mockStatic(FirebaseApp.class)) {
        app.when(FirebaseApp::getApps).thenReturn(List.of());

        service.sendLocalized(userId, "t", "b", null);

        verifyNoInteractions(appUserRepository, deviceTokenRepository, systemPushHistoryRepository, messageSource);
      }
    }

    @Test void sendToUserTokens_앱없으면_0반환() {
      try (MockedStatic<FirebaseApp> app = mockStatic(FirebaseApp.class)) {
        app.when(FirebaseApp::getApps).thenReturn(List.of());

        int sent = service.sendToUserTokens(userId, "제목", "본문", null);

        assertEquals(0, sent);
        verifyNoInteractions(deviceTokenRepository);
      }
    }
  }

  // ── sendLocalized: 가드 + 렌더링 + 이력저장 조건 ─────────────────────

  @Nested class SendLocalizedGuardAndRender {
    @Test void 알림꺼져있으면_전송안함() {
      try (MockedStatic<FirebaseApp> app = appConfigured()) {
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(false));

        service.sendLocalized(userId, "t", "b", null);

        verifyNoInteractions(deviceTokenRepository);
      }
    }

    @Test void 알림설정없으면_기본허용() {
      try (MockedStatic<FirebaseApp> app = appConfigured()) {
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.empty());
        when(appUserRepository.findLangCdById(userId)).thenReturn(Optional.of("ko"));
        when(messageSource.getMessage(eq("t"), any(), any(Locale.class))).thenReturn("제목");
        when(messageSource.getMessage(eq("b"), any(), any(Locale.class))).thenReturn("본문");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of());

        service.sendLocalized(userId, "t", "b", null);

        verify(deviceTokenRepository).findAllByUserId(userId);
      }
    }

    @Test void 단일인자_제목본문_플레이스홀더치환() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        when(appUserRepository.findLangCdById(userId)).thenReturn(Optional.of("ko"));
        when(messageSource.getMessage(eq("t"), any(), any(Locale.class))).thenReturn("안녕 {0}");
        when(messageSource.getMessage(eq("b"), any(), any(Locale.class))).thenReturn("본문 {0}");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(token("android", "tok1")));
        when(firebaseMessaging.send(any(Message.class))).thenReturn("msg-1");

        service.sendLocalized(userId, "t", "b", "철수", "/link", "some_type");

        ArgumentCaptor<SystemPushHistory> captor = ArgumentCaptor.forClass(SystemPushHistory.class);
        verify(systemPushHistoryRepository).save(captor.capture());
        assertEquals("안녕 철수", captor.getValue().getTitle());
        assertEquals("본문 철수", captor.getValue().getBody());
      }
    }

    @Test void 두인자버전_본문에_둘다치환_제목은_첫인자만() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        when(appUserRepository.findLangCdById(userId)).thenReturn(Optional.of("ko"));
        when(messageSource.getMessage(eq("t"), any(), any(Locale.class))).thenReturn("{0}님 알림");
        when(messageSource.getMessage(eq("b"), any(), any(Locale.class))).thenReturn("{0} vs {1}");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(token("android", "tok1")));
        when(firebaseMessaging.send(any(Message.class))).thenReturn("msg-1");

        service.sendLocalized(userId, "t", "b", "철수", "영희", "/link", "some_type");

        ArgumentCaptor<SystemPushHistory> captor = ArgumentCaptor.forClass(SystemPushHistory.class);
        verify(systemPushHistoryRepository).save(captor.capture());
        assertEquals("철수님 알림", captor.getValue().getTitle());
        assertEquals("철수 vs 영희", captor.getValue().getBody());
      }
    }

    @Test void pushType없으면_이력저장안함() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        when(appUserRepository.findLangCdById(userId)).thenReturn(Optional.of("ko"));
        when(messageSource.getMessage(eq("t"), any(), any(Locale.class))).thenReturn("제목");
        when(messageSource.getMessage(eq("b"), any(), any(Locale.class))).thenReturn("본문");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(token("android", "tok1")));
        when(firebaseMessaging.send(any(Message.class))).thenReturn("msg-1");

        service.sendLocalized(userId, "t", "b", null); // pushType 없는 4-인자 오버로드

        verify(systemPushHistoryRepository, never()).save(any());
      }
    }

    @Test void 전송0건이면_pushType있어도_이력저장안함() {
      try (MockedStatic<FirebaseApp> app = appConfigured()) {
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        when(appUserRepository.findLangCdById(userId)).thenReturn(Optional.of("ko"));
        when(messageSource.getMessage(eq("t"), any(), any(Locale.class))).thenReturn("제목");
        when(messageSource.getMessage(eq("b"), any(), any(Locale.class))).thenReturn("본문");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of()); // 토큰 없음

        service.sendLocalized(userId, "t", "b", null, "/link", "some_type");

        verify(systemPushHistoryRepository, never()).save(any());
      }
    }
  }

  // ── sendToUserTokens: FCM 전송/에러 처리 ─────────────────────────

  @Nested class SendToUserTokens {
    @Test void 여러토큰_모두성공하면_전송건수합산() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        when(deviceTokenRepository.findAllByUserId(userId))
            .thenReturn(List.of(token("android", "tok1"), token("web", "tok2")));
        when(firebaseMessaging.send(any(Message.class))).thenReturn("msg-id");

        int sent = service.sendToUserTokens(userId, "제목", "본문", "/link");

        assertEquals(2, sent);
        verify(firebaseMessaging, org.mockito.Mockito.times(2)).send(any(Message.class));
      }
    }

    @Test void 죽은토큰이면_삭제하고_에러로그는_안남김() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        DeviceToken deadToken = token("android", "dead-tok");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(deadToken));
        FirebaseMessagingException ex = mock(FirebaseMessagingException.class);
        when(ex.getMessagingErrorCode()).thenReturn(MessagingErrorCode.UNREGISTERED);
        when(firebaseMessaging.send(any(Message.class))).thenThrow(ex);

        int sent = service.sendToUserTokens(userId, "제목", "본문", null);

        assertEquals(0, sent);
        verify(deviceTokenRepository).delete(deadToken);
        verifyNoInteractions(errorLogService);
      }
    }

    @Test void 유효하지않은토큰도_삭제대상() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        DeviceToken badToken = token("ios", "bad-tok");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(badToken));
        FirebaseMessagingException ex = mock(FirebaseMessagingException.class);
        when(ex.getMessagingErrorCode()).thenReturn(MessagingErrorCode.INVALID_ARGUMENT);
        when(firebaseMessaging.send(any(Message.class))).thenThrow(ex);

        service.sendToUserTokens(userId, "제목", "본문", null);

        verify(deviceTokenRepository).delete(badToken);
      }
    }

    @Test void 죽지않은토큰실패면_삭제안하고_에러로그남김() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        DeviceToken t = token("android", "tok1");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(t));
        FirebaseMessagingException ex = mock(FirebaseMessagingException.class);
        when(ex.getMessagingErrorCode()).thenReturn(MessagingErrorCode.INTERNAL);
        when(ex.getMessage()).thenReturn("internal error");
        when(firebaseMessaging.send(any(Message.class))).thenThrow(ex);

        int sent = service.sendToUserTokens(userId, "제목", "본문", null);

        assertEquals(0, sent);
        verify(deviceTokenRepository, never()).delete(any());
        verify(errorLogService).recordServiceError(
            eq("push"), eq("INTERNAL"), eq("internal error"), eq(null), eq("userId=" + userId + " platform=android"));
      }
    }

    @Test void FCM이외_예외나도_한토큰만_실패하고_계속진행() throws Exception {
      try (MockedStatic<FirebaseApp> app = appConfigured();
           MockedStatic<FirebaseMessaging> fm = mockStatic(FirebaseMessaging.class)) {
        fm.when(FirebaseMessaging::getInstance).thenReturn(firebaseMessaging);
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(true));
        DeviceToken bad = token("android", "bad");
        DeviceToken good = token("android", "good");
        when(deviceTokenRepository.findAllByUserId(userId)).thenReturn(List.of(bad, good));
        when(firebaseMessaging.send(any(Message.class)))
            .thenThrow(new RuntimeException("network"))
            .thenReturn("msg-id");

        int sent = service.sendToUserTokens(userId, "제목", "본문", null);

        assertEquals(1, sent);
        verify(errorLogService).recordServiceError(
            eq("push"), eq("RuntimeException"), eq("network"), any(),
            eq("userId=" + userId + " platform=android"));
      }
    }

    @Test void 알림꺼져있으면_0반환_토큰조회안함() {
      try (MockedStatic<FirebaseApp> app = appConfigured()) {
        when(appUserRepository.findPushEnabledById(userId)).thenReturn(Optional.of(false));

        int sent = service.sendToUserTokens(userId, "제목", "본문", null);

        assertEquals(0, sent);
        verifyNoInteractions(deviceTokenRepository);
      }
    }
  }
}
