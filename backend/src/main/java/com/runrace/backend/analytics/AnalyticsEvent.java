package com.runrace.backend.analytics;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "analytics_event")
@Getter
@Setter
@NoArgsConstructor
public class AnalyticsEvent {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private AppUser user;

  @Column(name = "name", nullable = false, length = 80)
  private String name;

  @Column(name = "props_json", columnDefinition = "text")
  private String propsJson;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;
}

