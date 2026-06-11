package com.runrace.backend.auth;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.user.NicknameGenerator;
import java.time.OffsetDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 로그인 시 app_user 프로비저닝(upsert)을 한곳에서 처리한다.
 * Firebase·Kakao 등 인증 경로가 공통으로 사용하며, 신규 사용자에게 생성 시각·고유 닉네임을 부여한다.
 */
@Service
@RequiredArgsConstructor
public class UserProvisioningService {
  /** 고유 닉네임 생성 최대 시도 횟수. */
  private static final int MAX_NICKNAME_ATTEMPTS = 10;

  private final AppUserRepository appUserRepository;

  /**
   * firebaseUid 기준으로 사용자를 upsert한다. 신규면 생성 시각·언어·고유 닉네임을 부여한다.
   * (변경 없는 기존 사용자는 Hibernate dirty-checking이 UPDATE를 생략한다.)
   *
   * @param langHint 최초 가입 시 추정 언어(Accept-Language). 기존 사용자에게는 영향 없음.
   */
  @Transactional
  public AppUser upsert(
      String firebaseUid,
      String email,
      String displayName,
      String provider,
      String langHint) {

    AppUser existing = appUserRepository.findByFirebaseUid(firebaseUid).orElse(null);

    if (existing != null) {
      // 변경이 있을 때만 dirty — 동일 프로필 재방문은 SELECT만으로 끝낸다.
      boolean changed = !Objects.equals(existing.getEmail(), email)
          || !Objects.equals(existing.getDisplayName(), displayName)
          || !Objects.equals(existing.getProvider(), provider);
      if (!changed) return existing;

      existing.updateProfile(firebaseUid, email, displayName, provider);
      return appUserRepository.save(existing);
    }

    String lang = SupportedLanguages.normalizeOrDefault(langHint);
    AppUser newUser = AppUser.builder()
        .firebaseUid(firebaseUid)
        .email(email)
        .displayName(displayName)
        .provider(provider)
        .createdAt(OffsetDateTime.now())
        .langCd(lang)
        .nickname(generateUniqueNickname(lang))
        .build();
    return appUserRepository.save(newUser);
  }

  private String generateUniqueNickname(String lang) {
    for (int i = 0; i < MAX_NICKNAME_ATTEMPTS; i++) {
      String candidate = NicknameGenerator.generate(lang);
      if (!appUserRepository.existsByNickname(candidate)) {
        return candidate;
      }
    }
    throw ApiException.conflict("nickname_unavailable");
  }
}
