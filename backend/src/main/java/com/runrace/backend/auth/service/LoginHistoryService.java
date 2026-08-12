package com.runrace.backend.auth.service;

import com.runrace.backend.auth.domain.UserLoginHistory;
import com.runrace.backend.auth.repository.UserLoginHistoryRepository;
import com.runrace.backend.user.domain.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LoginHistoryService {
  private final UserLoginHistoryRepository repository;

  @Transactional
  public void record(AppUser user, String platform, String userAgent) {
    repository.save(UserLoginHistory.of(
        user.getId(), user.getProvider(), resolvePlatform(platform, userAgent), userAgent));
  }

  private static String resolvePlatform(String platform, String userAgent) {
    if (platform != null && !platform.isBlank()) return platform;
    if (userAgent == null) return null;
    String lower = userAgent.toLowerCase(java.util.Locale.ROOT);
    if (lower.contains("android")) return "android";
    if (lower.contains("iphone") || lower.contains("ipad")) return "ios";
    return "web";
  }
}
