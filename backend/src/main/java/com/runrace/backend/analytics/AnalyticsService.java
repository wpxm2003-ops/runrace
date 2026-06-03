package com.runrace.backend.analytics;

import com.runrace.backend.user.AppUser;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AnalyticsService {
  private final AnalyticsEventRepository analyticsEventRepository;

  @Transactional
  public void track(AppUser userOrNull, String name, String propsJson) {
    AnalyticsEvent ev = new AnalyticsEvent();
    ev.setUser(userOrNull);
    ev.setName(name);
    ev.setPropsJson(propsJson);
    ev.setCreatedAt(OffsetDateTime.now());
    analyticsEventRepository.save(ev);
  }
}

