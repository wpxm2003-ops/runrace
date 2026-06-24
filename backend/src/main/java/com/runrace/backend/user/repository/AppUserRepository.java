package com.runrace.backend.user.repository;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository
    extends JpaRepository<AppUser, UUID>, AppUserRepositoryCustom {

  Optional<AppUser> findByFirebaseUid(String firebaseUid);

  Optional<AppUser> findByEmail(String email);

  boolean existsByNickname(String nickname);

  Optional<AppUser> findByNickname(String nickname);

  /**
   * 가입일(KST)이 {@code signupDate}이면서 아직 운동 기록이 한 건도 없는 사용자 id 목록.
   * 신규 가입자 활성화(첫 러닝 유도) 푸시 대상. 가입 후 정확히 N일째에만 조회해 1회만 발송한다.
   */
  @Query(value = """
      select u.id from app_user u
      where (u.created_at at time zone 'Asia/Seoul')::date = :signupDate
        and not exists (select 1 from workout_session w where w.user_id = u.id)
      """, nativeQuery = true)
  List<UUID> findInactiveSignups(@Param("signupDate") LocalDate signupDate);

  /** id로 사용자를 조회하되 없으면 404로 변환한다. {@code findById(...).orElseThrow()} 중복 제거용. */
  default AppUser getRequired(UUID id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("user_not_found"));
  }
}
