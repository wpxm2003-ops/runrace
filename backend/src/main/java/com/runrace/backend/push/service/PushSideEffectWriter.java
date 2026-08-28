package com.runrace.backend.push.service;

import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 푸시 발송 뒤의 DB 후처리를 독립 트랜잭션으로 확정한다.
 *
 * <p>대부분의 푸시는 {@code AFTER_COMMIT} 리스너에서 발송된다. 그 시점에는 원 트랜잭션의
 * 리소스가 아직 스레드에 묶여 있어 기본 {@code REQUIRED} 쓰기가 실행된 것처럼 보여도 다시
 * 커밋되지 않는다. 무효 토큰 정리와 오류 기록은 반드시 새 트랜잭션에서 처리한다.
 */
@Component
@RequiredArgsConstructor
public class PushSideEffectWriter {

  private final DeviceTokenRepository deviceTokenRepository;
  private final ErrorLogService errorLogService;

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void deleteDeadToken(UUID tokenId) {
    deviceTokenRepository.deleteById(tokenId);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void recordError(
      String source, String errorCode, String message, String stack, String context) {
    errorLogService.recordServiceError(source, errorCode, message, stack, context);
  }
}
