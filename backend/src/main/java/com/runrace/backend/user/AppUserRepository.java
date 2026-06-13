package com.runrace.backend.user;

import com.runrace.backend.common.ApiException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository
    extends JpaRepository<AppUser, UUID>, AppUserRepositoryCustom {

  Optional<AppUser> findByFirebaseUid(String firebaseUid);

  Optional<AppUser> findByEmail(String email);

  boolean existsByNickname(String nickname);

  Optional<AppUser> findByNickname(String nickname);

  /** id로 사용자를 조회하되 없으면 404로 변환한다. {@code findById(...).orElseThrow()} 중복 제거용. */
  default AppUser getRequired(UUID id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("user_not_found"));
  }
}
