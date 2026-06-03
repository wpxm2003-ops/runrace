package com.runrace.backend.workout;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "workout_session")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutSession {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "started_at", nullable = false)
  private OffsetDateTime startedAt;

  @Column(name = "ended_at", nullable = false)
  private OffsetDateTime endedAt;

  @Column(name = "duration_sec", nullable = false)
  private int durationSec;

  @Column(name = "distance_m", nullable = false)
  private int distanceM;

  @Column(name = "calories", nullable = false)
  private int calories;

  @Column(name = "avg_pace_sec_per_km")
  private Integer avgPaceSecPerKm;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "path_json", nullable = false)
  private String pathJson;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;
}
