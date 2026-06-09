package com.runrace.backend.user;

import com.runrace.backend.common.ApiException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
  Optional<AppUser> findByFirebaseUid(String firebaseUid);

  boolean existsByNickname(String nickname);

  Optional<AppUser> findByNickname(String nickname);

  /** 푸시 발신 시 수신자 언어만 가볍게 조회한다(엔티티 전체 로드 회피). */
  @Query("select u.langCd from AppUser u where u.id = :id")
  Optional<String> findLangCdById(@Param("id") UUID id);

  /** id로 사용자를 조회하되 없으면 404로 변환한다. {@code findById(...).orElseThrow()} 중복 제거용. */
  default AppUser getRequired(UUID id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("user_not_found"));
  }
}
