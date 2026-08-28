package com.runrace.backend.user.repository;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AppUserRepository
    extends JpaRepository<AppUser, UUID>, AppUserRepositoryCustom {

  @Query("select u from AppUser u where u.withdrawnAt is null order by u.createdAt desc")
  List<AppUser> findRecentActiveUsers(org.springframework.data.domain.Pageable pageable);

  /**
   * 사용자 행을 잠그고 조회 — "이 사용자의 X를 세어보고 한도 미만이면 하나 더 만든다" 류의
   * 조회~저장 사이가 벌어지는 처리를 직렬화하는 용도. 같은 사용자의 동시 요청끼리만 대기하므로
   * 서로 다른 사용자 사이에는 경합이 없다.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from AppUser u where u.id = :id")
  Optional<AppUser> findByIdForUpdate(@Param("id") UUID id);

  /** 탈퇴하지 않은 사용자만 잠그고 조회한다. 인증 후 탈퇴와 경합한 변경 요청을 차단한다. */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from AppUser u where u.id = :id and u.withdrawnAt is null")
  Optional<AppUser> findActiveByIdForUpdate(@Param("id") UUID id);

  Optional<AppUser> findByFirebaseUid(String firebaseUid);

  /** 로그인 프로필 갱신과 탈퇴 익명화가 같은 행을 동시에 저장하지 않도록 직렬화한다. */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from AppUser u where u.firebaseUid = :firebaseUid")
  Optional<AppUser> findByFirebaseUidForUpdate(@Param("firebaseUid") String firebaseUid);

  Optional<AppUser> findByEmail(String email);

  /** 검증된 이메일 계정 병합도 같은 사용자 행의 탈퇴·설정 변경과 직렬화한다. */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from AppUser u where u.email = :email")
  Optional<AppUser> findByEmailForUpdate(@Param("email") String email);

  /** 자체 JWT의 주체가 현재도 같은 활성 계정인지 중앙 인증 필터에서 확인한다. */
  boolean existsByIdAndFirebaseUidAndWithdrawnAtIsNull(UUID id, String firebaseUid);

  /** 닉네임 중복 체크 — 탈퇴(익명화) 계정은 제외해 원래 닉네임 재사용을 허용한다. */
  boolean existsByNicknameAndWithdrawnAtIsNull(String nickname);

  /** 닉네임으로 활성 회원 조회(라이벌 검색 등) — 탈퇴 계정은 검색에 잡히지 않는다. */
  Optional<AppUser> findByNicknameAndWithdrawnAtIsNull(String nickname);

  /**
   * 최근 가입했으며 아직 운동 기록이 한 건도 없는 사용자와 IANA 시간대 목록.
   * 정확한 현지 가입 경과일 판정은 스케줄러에서 수행한다.
   */
  @Query(value = """
      select u.id as "userId", u.created_at as "createdAt", u.time_zone as "timeZone"
      from users u
      where u.created_at >= :createdAfter
        and u.withdrawn_at is null
        and not exists (select 1 from workout_session w where w.user_id = u.id)
      """, nativeQuery = true)
  List<InactiveSignupCandidate> findInactiveSignups(
      @Param("createdAfter") OffsetDateTime createdAfter);

  interface InactiveSignupCandidate {
    UUID getUserId();
    OffsetDateTime getCreatedAt();
    String getTimeZone();
  }

  /** id로 사용자를 조회하되 없으면 404로 변환한다. {@code findById(...).orElseThrow()} 중복 제거용. */
  default AppUser getRequired(UUID id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("user_not_found"));
  }

  /** {@link #findByIdForUpdate} + 없으면 404 — 잠금 조회의 {@code orElseThrow} 중복 제거용. */
  default AppUser getRequiredForUpdate(UUID id) {
    return findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("user_not_found"));
  }

  /** 인증 뒤 탈퇴가 먼저 커밋됐다면 변경을 진행하지 않도록 활성 행만 잠근다. */
  default AppUser getRequiredActiveForUpdate(UUID id) {
    return findActiveByIdForUpdate(id)
        .orElseThrow(() -> ApiException.notFound("user_not_found"));
  }

  /**
   * 푸시 수신 선호를 켠다(첫 디바이스 토큰 등록 시점). 멱등 — 이미 true여도 무해.
   * upsert가 통짜 트랜잭션이 아니므로(레이스 캐치 유지) 이 갱신은 자체 트랜잭션으로 실행한다.
   */
  @Modifying
  @Transactional
  @Query("""
      update AppUser u
      set u.pushEnabled = true, u.version = u.version + 1
      where u.id = :id and u.withdrawnAt is null
      """)
  void enablePush(@Param("id") UUID id);
}
