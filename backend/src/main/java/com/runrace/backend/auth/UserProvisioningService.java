package com.runrace.backend.auth;

import com.runrace.backend.common.ApiException;
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
  private final AppUserRepository appUserRepository;

  /**
   * firebaseUid 기준으로 사용자를 upsert한다. 신규면 생성 시각·고유 닉네임을 부여한다.
   * (변경 없는 기존 사용자는 Hibernate dirty-checking이 UPDATE를 생략한다.)
   */
  @Transactional
  public AppUser upsert(
      String firebaseUid, String email, String displayName, String photoUrl, String provider) {
    AppUser user = appUserRepository.findByFirebaseUid(firebaseUid).orElseGet(AppUser::new);
    boolean isNew = user.getId() == null;

    // 변경이 있을 때만 write — 기존 사용자의 동일 프로필 재방문은 SELECT만으로 끝낸다.
    boolean changed = isNew;
    changed |= !Objects.equals(user.getEmail(), email);
    changed |= !Objects.equals(user.getDisplayName(), displayName);
    changed |= !Objects.equals(user.getPhotoUrl(), photoUrl);
    changed |= !Objects.equals(user.getProvider(), provider);
    if (!changed) {
      return user;
    }

    user.setFirebaseUid(firebaseUid);
    user.setEmail(email);
    user.setDisplayName(displayName);
    user.setPhotoUrl(photoUrl);
    user.setProvider(provider);
    if (isNew) {
      user.setCreatedAt(OffsetDateTime.now());
      user.setNickname(generateUniqueNickname());
    }
    return appUserRepository.save(user);
  }

  private String generateUniqueNickname() {
    for (int i = 0; i < 10; i++) {
      String candidate = NicknameGenerator.generate();
      if (!appUserRepository.existsByNickname(candidate)) {
        return candidate;
      }
    }
    throw ApiException.conflict("nickname_unavailable");
  }
}
