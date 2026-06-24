package com.runrace.backend.auth.service;

import com.google.firebase.auth.FirebaseAuth;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.common.TextValidation;
import com.runrace.backend.config.CacheConfig;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 내 계정 관련 읽기/쓰기(본인 조회, 닉네임 변경, 탈퇴). */
@Service
@RequiredArgsConstructor
public class AccountService {
  private static final Logger log = LoggerFactory.getLogger(AccountService.class);
  private static final int NICKNAME_MAX_LEN = 20;

  private final AppUserRepository appUserRepository;
  private final CacheManager cacheManager;

  @Transactional(readOnly = true)
  public AppUser getUser(UUID userId) {
    return appUserRepository.getRequired(userId);
  }

  @Transactional
  public AppUser updateNickname(UUID userId, String rawNickname) {
    String trimmed = TextValidation.requireCleanText(rawNickname, NICKNAME_MAX_LEN, false, "nickname");
    AppUser user = appUserRepository.getRequired(userId);
    if (!trimmed.equals(user.getNickname()) && appUserRepository.existsByNickname(trimmed)) {
      throw ApiException.badRequest("nickname_taken");
    }
    user.changeNickname(trimmed);
    try {
      return appUserRepository.saveAndFlush(user);
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      // 동시 변경으로 유니크 위반 — 깔끔한 4xx로 변환(500/에러로그 방지)
      throw ApiException.badRequest("nickname_taken");
    }
  }

  /** 푸시 알림 수신 선호 조회. */
  @Transactional(readOnly = true)
  public boolean isPushEnabled(UUID userId) {
    return appUserRepository.findPushEnabledById(userId).orElse(true);
  }

  /** 푸시 알림 수신 선호 변경(내정보 토글). */
  @Transactional
  public void updatePushEnabled(UUID userId, boolean enabled) {
    AppUser user = appUserRepository.getRequired(userId);
    user.changePushEnabled(enabled);
    appUserRepository.save(user);
  }

  /** 주력 언어 선호값 변경 — 푸시 알림 언어에 사용된다. */
  @Transactional
  public AppUser updateLanguage(UUID userId, String langCd) {
    if (!SupportedLanguages.isSupported(langCd)) {
      throw ApiException.badRequest("invalid_lang_cd");
    }
    AppUser user = appUserRepository.getRequired(userId);
    user.changeLangCd(langCd);
    return appUserRepository.save(user);
  }

  /**
   * 계정 삭제 — app_user 삭제(연관 데이터 CASCADE) 후 Firebase 계정도 삭제한다.
   * Firebase 삭제는 외부 호출이므로 DB 트랜잭션 밖에서 수행하며, 실패해도 DB 삭제는 유지한다.
   */
  public void deleteAccount(UUID userId) {
    AppUser user = appUserRepository.getRequired(userId);
    String firebaseUid = user.getFirebaseUid();
    appUserRepository.delete(user);

    // 캐시된 인증 주체 즉시 무효화 — 삭제된 계정이 TTL 동안 통과하지 못하게 한다.
    Cache cache = cacheManager.getCache(CacheConfig.AUTH_PRINCIPALS);
    if (cache != null) {
      cache.evict(firebaseUid);
    }

    try {
      FirebaseAuth.getInstance().deleteUser(firebaseUid);
    } catch (Exception e) {
      log.warn("Firebase 계정 삭제 실패 (uid={}): {}", firebaseUid, e.getMessage());
    }
  }
}
