package com.runrace.backend.history.repository;

import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserActivityHistoryRepository
    extends JpaRepository<UserActivityHistory, Long> {

  @Query("select h.id as id, u.displayName as displayName, h.actionType as actionType, "
      + "h.targetType as targetType, h.occurredAt as occurredAt "
      + "from UserActivityHistory h join AppUser u on u.id = h.actorUserId "
      + "where u.displayName not in :excludedNames "
      + "order by h.occurredAt desc")
  List<AdminActivityView> findRecentForAdmin(
      @Param("excludedNames") List<String> excludedNames,
      org.springframework.data.domain.Pageable pageable);

  interface AdminActivityView {
    Long getId();
    String getDisplayName();
    ActivityAction getActionType();
    ActivityTargetType getTargetType();
    OffsetDateTime getOccurredAt();
  }
}
