package com.runrace.backend.push.service;

import com.runrace.backend.push.domain.SystemPushHistory;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 커밋 후 푸시 리스너에서도 발송 이력을 확실히 커밋한다. */
@Component
@RequiredArgsConstructor
public class PushHistoryWriter {

  private final SystemPushHistoryRepository repository;

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void write(SystemPushHistory history) {
    repository.save(history);
  }
}
