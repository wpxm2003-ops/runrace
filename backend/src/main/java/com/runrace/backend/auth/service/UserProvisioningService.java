package com.runrace.backend.auth.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.user.service.NicknameGenerator;
import java.time.OffsetDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 로그인 시 app_user 프로비저닝(upsert)을 한곳에서 처리한다.
 * Firebase·Kakao 등 인증 경로가 공통으로 사용하며, 신규 사용자에게 생성 시각·고유 닉네임을 부여한다.
 */
@Service
@RequiredArgsConstructor
public class UserProvisioningService {
  private static final Logger log = LoggerFactory.getLogger(UserProvisioningService.class);
  /** 고유 닉네임 생성 최대 시도 횟수. */
  private static final int MAX_NICKNAME_ATTEMPTS = 10;

  private final AppUserRepository appUserRepository;
  private final UserInsertTx userInsertTx;

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
      boolean emailVerified,
      String langHint) {

    AppUser existing = appUserRepository.findByFirebaseUid(firebaseUid).orElse(null);

    if (existing != null) {
      // 비어 들어온 값으로 기존 값을 덮지 않는다.
      // (예: 카카오 사용자는 Firebase 커스텀 토큰으로 인증돼 토큰에 name·email 클레임이 없어
      //  null이 넘어오는데, 이때 기존 이름/이메일을 지우면 안 된다.)
      String nextName = nonBlankOr(displayName, existing.getDisplayName());
      String nextEmail = nonBlankOr(email, existing.getEmail());
      String nextProvider = resolveProvider(provider, existing.getProvider());

      // 변경이 있을 때만 dirty — 동일 프로필 재방문은 SELECT만으로 끝낸다.
      boolean changed = !Objects.equals(existing.getEmail(), nextEmail)
          || !Objects.equals(existing.getDisplayName(), nextName)
          || !Objects.equals(existing.getProvider(), nextProvider);
      if (!changed) return existing;

      existing.updateProfile(firebaseUid, nextEmail, nextName, nextProvider);
      return appUserRepository.save(existing);
    }

    // 동일 이메일로 다른 provider 계정이 있으면 해당 계정의 firebaseUid를 새 provider로 업데이트 (계정 병합).
    // 단, 검증된 이메일일 때만 — 미검증 이메일로 남의 계정을 탈취하는 것을 막는다(미검증이면 별도 계정 생성).
    if (email != null && emailVerified) {
      AppUser byEmail = appUserRepository.findByEmail(email).orElse(null);
      if (byEmail != null) {
        log.info("Merging account [{}] into existing [{}] by email", firebaseUid, byEmail.getFirebaseUid());
        // 병합 시에도 빈 이름·일반 provider("custom")로 기존 값을 지우지 않는다.
        byEmail.updateProfile(
            firebaseUid,
            email,
            nonBlankOr(displayName, byEmail.getDisplayName()),
            resolveProvider(provider, byEmail.getProvider()));
        return appUserRepository.save(byEmail);
      }
    }

    String lang = SupportedLanguages.normalizeOrDefault(langHint);
    return createNewUser(firebaseUid, email, displayName, provider, lang);
  }

  /**
   * 신규 사용자 생성 — 닉네임 유니크 충돌·동시 가입 경쟁을 안전하게 처리한다.
   * <ul>
   *   <li>빠른 회피: 후보 닉네임이 이미 있으면 INSERT 없이 다음 후보로.</li>
   *   <li>경쟁 방어: 독립 트랜잭션 INSERT가 유니크 위반 나면(동시 가입) 닉네임은 재시도,
   *       같은 firebaseUid가 이미 생성됐으면 그 행을 회수한다.</li>
   * </ul>
   */
  private AppUser createNewUser(
      String firebaseUid, String email, String displayName, String provider, String lang) {
    for (int i = 0; i < MAX_NICKNAME_ATTEMPTS; i++) {
      String nickname = NicknameGenerator.generate(lang);
      if (appUserRepository.existsByNickname(nickname)) continue; // 빠른 회피

      AppUser candidate = AppUser.builder()
          .firebaseUid(firebaseUid)
          .email(email)
          .displayName(displayName)
          .provider(provider)
          .createdAt(OffsetDateTime.now())
          .langCd(lang)
          .nickname(nickname)
          .build();
      try {
        return userInsertTx.insert(candidate);
      } catch (DataIntegrityViolationException e) {
        // 동시 가입으로 같은 firebaseUid 행이 이미 생성됐으면 그 행을 사용(경쟁에서 진 경우)
        AppUser raced = appUserRepository.findByFirebaseUid(firebaseUid).orElse(null);
        if (raced != null) return raced;
        // 닉네임 경쟁에서 진 경우 → 다음 후보로 재시도
      }
    }
    throw ApiException.conflict("nickname_unavailable");
  }

  /** 새 값이 비어있으면(null/blank) 기존 값을 유지한다. */
  private static String nonBlankOr(String incoming, String current) {
    return (incoming != null && !incoming.isBlank()) ? incoming : current;
  }

  /**
   * provider를 갱신하되, 들어온 값이 비었거나 일반 래퍼("custom")면 기존 값을 유지한다.
   * (카카오는 Firebase 커스텀 토큰으로 인증돼 sign_in_provider가 "custom"으로 넘어오므로
   *  이미 저장된 "kakao"를 덮어쓰지 않게 한다.)
   */
  private static String resolveProvider(String incoming, String current) {
    if (current == null || current.isBlank()) return incoming;
    if (incoming == null || incoming.isBlank() || "custom".equals(incoming)) return current;
    return incoming;
  }
}
