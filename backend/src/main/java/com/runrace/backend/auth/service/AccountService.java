package com.runrace.backend.auth.service;

import com.google.firebase.auth.FirebaseAuth;
import com.runrace.backend.auth.service.AccountWithdrawalTx.WithdrawalCleanup;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.common.TextValidation;
import com.runrace.backend.config.CacheConfig;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.upload.ImageUploadService;
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
  private final AccountWithdrawalTx accountWithdrawalTx;
  private final ImageUploadService imageUploadService;
  private final DeviceTokenRepository deviceTokenRepository;

  @Transactional(readOnly = true)
  public AppUser getUser(UUID userId) {
    return appUserRepository.getRequired(userId);
  }

  @Transactional
  public AppUser updateNickname(UUID userId, String rawNickname) {
    String trimmed = TextValidation.requireCleanText(rawNickname, NICKNAME_MAX_LEN, false, "nickname");
    AppUser user = appUserRepository.getRequired(userId);
    if (!trimmed.equals(user.getNickname()) && appUserRepository.existsByNicknameAndWithdrawnAtIsNull(trimmed)) {
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

  /** 푸시 수신 가능한 단말(디바이스 토큰)이 등록돼 있는지 — 없으면 토글 자체가 불가. */
  @Transactional(readOnly = true)
  public boolean hasDeviceToken(UUID userId) {
    return deviceTokenRepository.existsByUserId(userId);
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
   * 계정 탈퇴 — 개인정보를 익명화하되 레이스 정합성을 위해 행은 보존한다(하드 삭제 아님).
   * DB 익명화는 트랜잭션 안에서 원자적으로 처리하고, 외부 I/O(S3·Firebase)는 커밋 이후 best-effort로 수행한다.
   */
  public void deleteAccount(UUID userId) {
    WithdrawalCleanup cleanup = accountWithdrawalTx.anonymize(userId);
    String firebaseUid = cleanup.firebaseUid();

    // 캐시된 인증 주체 즉시 무효화 — 탈퇴 계정이 TTL 동안 통과하지 못하게 한다.
    Cache cache = cacheManager.getCache(CacheConfig.AUTH_PRINCIPALS);
    if (cache != null) {
      cache.evict(firebaseUid);
    }

    // 운동 이미지 S3 정리 — 실패해도 익명화는 유지(best-effort, delete 내부에서 로깅·삼킴).
    imageUploadService.deleteAll(cleanup.imageUrls());

    try {
      FirebaseAuth.getInstance().deleteUser(firebaseUid);
    } catch (Exception e) {
      log.warn("Firebase 계정 삭제 실패 (uid={}): {}", firebaseUid, e.getMessage());
    }
  }
}
