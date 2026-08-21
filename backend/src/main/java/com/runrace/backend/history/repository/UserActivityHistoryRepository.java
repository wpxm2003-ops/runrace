package com.runrace.backend.history.repository;

import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface UserActivityHistoryRepository
    extends JpaRepository<UserActivityHistory, Long> {

  /**
   * 최근 활동 이력(운영자 제외). display_name이 null인 행도 반드시 포함해야 한다 —
   * 탈퇴 익명화가 display_name을 null로 만드는데, SQL에서 {@code NULL NOT IN (...)}은
   * true가 아니라 NULL이라 그 조건만으로는 탈퇴 사용자의 이력이 통째로 사라진다.
   * 특히 ACCOUNT_WITHDRAWN은 익명화 직전에 기록되므로 100% 누락됐다.
   */
  @Query("select h.id as id, u.displayName as displayName, h.actionType as actionType, "
      + "h.targetType as targetType, h.occurredAt as occurredAt "
      + "from UserActivityHistory h join AppUser u on u.id = h.actorUserId "
      + "where (u.displayName is null or u.displayName not in :excludedNames) "
      + "order by h.occurredAt desc")
  List<AdminActivityView> findRecentForAdmin(
      @Param("excludedNames") List<String> excludedNames,
      org.springframework.data.domain.Pageable pageable);

  /**
   * 보존 기간이 지난 이력을 배치 단위로 지운다. 한 문장으로 전부 지우면 첫 실행에서
   * 수십만 행에 락이 걸릴 수 있어 id 서브쿼리로 상한을 둔다.
   *
   * @return 실제로 삭제된 행 수 — batchSize 미만이면 더 지울 것이 없다는 뜻이다.
   */
  @Modifying
  @Transactional
  @Query(
      value = "delete from user_activity_history where id in ("
          + "select id from user_activity_history where occurred_at < :cutoff "
          + "order by occurred_at limit :batchSize)",
      nativeQuery = true)
  int deleteOlderThan(
      @Param("cutoff") OffsetDateTime cutoff, @Param("batchSize") int batchSize);

  interface AdminActivityView {
    Long getId();
    String getDisplayName();
    ActivityAction getActionType();
    ActivityTargetType getTargetType();
    OffsetDateTime getOccurredAt();
  }
}
