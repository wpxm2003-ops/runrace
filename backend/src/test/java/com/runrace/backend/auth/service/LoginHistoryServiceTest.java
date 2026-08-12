package com.runrace.backend.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;

import com.runrace.backend.auth.domain.UserLoginHistory;
import com.runrace.backend.auth.repository.UserLoginHistoryRepository;
import com.runrace.backend.user.domain.AppUser;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LoginHistoryServiceTest {
  @Mock UserLoginHistoryRepository repository;
  @InjectMocks LoginHistoryService service;

  @Test
  void recordsEverySuccessfulLoginWithoutIpAddress() {
    UUID userId = UUID.randomUUID();
    AppUser user = AppUser.builder()
        .id(userId)
        .provider("google")
        .build();

    service.record(user, null, "Mozilla/5.0 (Linux; Android 15)");
    service.record(user, null, "Mozilla/5.0 (Linux; Android 15)");

    ArgumentCaptor<UserLoginHistory> captor = ArgumentCaptor.forClass(UserLoginHistory.class);
    verify(repository, org.mockito.Mockito.times(2)).save(captor.capture());
    UserLoginHistory saved = captor.getAllValues().get(0);
    assertEquals(userId, saved.getUserId());
    assertEquals("google", saved.getProvider());
    assertEquals("android", saved.getPlatform());
    assertEquals("Mozilla/5.0 (Linux; Android 15)", saved.getUserAgent());
  }
}
