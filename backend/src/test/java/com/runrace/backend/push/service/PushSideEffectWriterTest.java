package com.runrace.backend.push.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;

import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import java.lang.reflect.Method;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@ExtendWith(MockitoExtension.class)
class PushSideEffectWriterTest {

  @Mock DeviceTokenRepository deviceTokenRepository;
  @Mock ErrorLogService errorLogService;
  @InjectMocks PushSideEffectWriter writer;

  @Test
  void deadTokenDeletionUsesRepository() {
    UUID tokenId = UUID.randomUUID();

    writer.deleteDeadToken(tokenId);

    verify(deviceTokenRepository).deleteById(tokenId);
  }

  @Test
  void errorRecordingDelegatesAllContext() {
    writer.recordError("push", "INTERNAL", "message", "stack", "context");

    verify(errorLogService).recordServiceError(
        "push", "INTERNAL", "message", "stack", "context");
  }

  @Test
  void allWritesRequireNewTransaction() throws Exception {
    for (String methodName : new String[] {"deleteDeadToken", "recordError"}) {
      Method method = java.util.Arrays.stream(PushSideEffectWriter.class.getDeclaredMethods())
          .filter(candidate -> candidate.getName().equals(methodName))
          .findFirst()
          .orElseThrow();
      Transactional transactional = method.getAnnotation(Transactional.class);
      assertEquals(Propagation.REQUIRES_NEW, transactional.propagation());
    }
  }
}
