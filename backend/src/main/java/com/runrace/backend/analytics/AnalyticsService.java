package com.runrace.backend.analytics;

import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AnalyticsService {
  private final AnalyticsEventRepository analyticsEventRepository;
  private final AppUserRepository appUserRepository;

  /** 분석 이벤트를 기록한다. {@code userId}가 null이면 익명 이벤트로 저장한다. */
  @Transactional
  public void track(UUID userId, String name, String propsJson) {
    AnalyticsEvent event = new AnalyticsEvent();
    event.setUser(userId == null ? null : appUserRepository.getReferenceById(userId));
    event.setName(name);
    event.setPropsJson(propsJson);
    event.setCreatedAt(OffsetDateTime.now());
    analyticsEventRepository.save(event);
  }
}
