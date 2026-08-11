package com.runrace.backend.workout.domain;

import com.runrace.backend.shoe.domain.Shoe;
import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "workout_session")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class WorkoutSession {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "client_workout_id")
  private UUID clientWorkoutId;

  @Column(name = "started_at", nullable = false)
  private OffsetDateTime startedAt;

  /**
   * 시작 시각의 기기 현지 벽시계(타임존 없음). 잔디·스트릭·달력 등 개인 날짜 집계의 기준 —
   * 뛴 그 순간·그 장소의 날짜를 박제해, 언어 설정·거주지·조회 시점 타임존과 무관하게 유지한다.
   */
  @Column(name = "started_at_local", nullable = false)
  private LocalDateTime startedAtLocal;

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

  @Builder.Default
  @Enumerated(EnumType.STRING)
  @Column(name = "workout_type", nullable = false)
  private WorkoutType workoutType = WorkoutType.GPS;

  @Column(name = "image_url")
  private String imageUrl;

  @Column(name = "memo", length = 500)
  private String memo;

  @Column(name = "ghost_workout_id")
  private Long ghostWorkoutId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "ghost_result")
  private String ghostResultJson;

  /** 이 러닝을 신은 신발(귀속). 신발 삭제 시 FK가 null로 풀린다. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "shoe_id")
  private Shoe shoe;

  public void updateMemo(String memo) {
    this.memo = memo;
  }

  /** 운동 사진을 설정·교체·삭제(null이면 삭제)한다. */
  public void updateImage(String imageUrl) {
    this.imageUrl = imageUrl;
  }

  /** 러닝의 신발 귀속을 설정·해제한다(null이면 해제). */
  public void assignShoe(Shoe shoe) {
    this.shoe = shoe;
  }

  /**
   * 탈퇴 익명화 — GPS 경로·이미지(개인 위치정보) 제거. 거리·시간 등 집계는 자산으로 보존한다.
   * path_json은 NOT NULL이라 null 대신 빈 배열로 비운다.
   */
  public void scrubPersonalData() {
    this.pathJson = "[]";
    this.imageUrl = null;
  }
}
