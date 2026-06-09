package com.runrace.backend.auth;

import com.google.firebase.auth.FirebaseAuth;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 내 계정 관련 쓰기(닉네임 변경·탈퇴). */
@Service
@RequiredArgsConstructor
public class AccountService {
  private static final Logger log = LoggerFactory.getLogger(AccountService.class);
  private static final int NICKNAME_MAX_LEN = 20;

  private final AppUserRepository appUserRepository;

  @Transactional
  public AppUser updateNickname(UUID userId, String rawNickname) {
    String trimmed = rawNickname == null ? "" : rawNickname.trim();
    if (trimmed.isEmpty() || trimmed.length() > NICKNAME_MAX_LEN) {
      throw ApiException.badRequest("invalid_nickname");
    }
    if (appUserRepository.existsByNickname(trimmed)) {
      throw ApiException.badRequest("nickname_taken");
    }
    AppUser user = appUserRepository.getRequired(userId);
    user.setNickname(trimmed);
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

    try {
      FirebaseAuth.getInstance().deleteUser(firebaseUid);
    } catch (Exception e) {
      log.warn("Firebase 계정 삭제 실패 (uid={}): {}", firebaseUid, e.getMessage());
    }
  }
}
