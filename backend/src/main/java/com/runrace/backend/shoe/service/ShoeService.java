package com.runrace.backend.shoe.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.shoe.domain.Shoe;
import com.runrace.backend.shoe.dto.ShoeFormRequest;
import com.runrace.backend.shoe.dto.ShoeRow;
import com.runrace.backend.shoe.repository.ShoeRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 신발장 — 등록·수정·삭제·활성화 + 러닝 귀속/교체 알림 트리거. */
@Service
@RequiredArgsConstructor
public class ShoeService {
  /** 사용자당 신발 등록 상한(어뷰즈 방지). */
  private static final int MAX_SHOES = 20;
  private static final int MAX_BRAND_LEN = 40;
  private static final int MAX_MODEL_LEN = 60;
  private static final int MAX_NICKNAME_LEN = 40;
  /** 교체 목표 거리 상한(m) — 비정상 입력 차단. 2000km. */
  private static final int MAX_TARGET_M = 2_000_000;

  private final ShoeRepository shoeRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ApplicationEventPublisher eventPublisher;

  @Transactional(readOnly = true)
  public List<ShoeRow> listShoes(UUID userId) {
    List<Shoe> shoes = shoeRepository.findAllByUser_IdOrderByCreatedAtDesc(userId);
    if (shoes.isEmpty()) return List.of();

    Map<Long, Long> mileage = new HashMap<>();
    for (var v : workoutSessionRepository.sumDistanceByShoeForUser(userId)) {
      mileage.put(v.getShoeId(), v.getTotalDistanceM());
    }
    return shoes.stream()
        .map(s -> new ShoeRow(
            s.getId(), s.getBrand(), s.getModel(), s.getNickname(),
            s.getTargetDistanceM(), s.isActive(),
            mileage.getOrDefault(s.getId(), 0L)))
        .toList();
  }

  @Transactional
  public Shoe createShoe(UUID userId, ShoeFormRequest body) {
    if (shoeRepository.countByUser_Id(userId) >= MAX_SHOES) {
      throw ApiException.badRequest("shoe_limit_reached");
    }
    String brand = requireText(body.brand(), MAX_BRAND_LEN, "invalid_brand");
    String model = requireText(body.model(), MAX_MODEL_LEN, "invalid_model");
    String nickname = optionalText(body.nickname(), MAX_NICKNAME_LEN);
    Integer target = normalizeTarget(body.targetDistanceM());

    AppUser user = appUserRepository.getRequired(userId);
    boolean first = shoeRepository.countByUser_Id(userId) == 0;
    Shoe shoe = shoeRepository.save(Shoe.builder()
        .user(user)
        .brand(brand)
        .model(model)
        .nickname(nickname)
        .targetDistanceM(target)
        .active(false)
        .createdAt(OffsetDateTime.now())
        .build());

    // 첫 신발이거나 활성 요청 시 활성화(기존 활성 해제).
    if (first || Boolean.TRUE.equals(body.active())) {
      activateShoe(userId, shoe.getId());
    }
    return shoe;
  }

  @Transactional
  public void updateShoe(UUID userId, Long shoeId, ShoeFormRequest body) {
    Shoe shoe = shoeRepository.findByIdAndUser_Id(shoeId, userId)
        .orElseThrow(() -> ApiException.notFound("shoe_not_found"));
    shoe.edit(
        requireText(body.brand(), MAX_BRAND_LEN, "invalid_brand"),
        requireText(body.model(), MAX_MODEL_LEN, "invalid_model"),
        optionalText(body.nickname(), MAX_NICKNAME_LEN),
        normalizeTarget(body.targetDistanceM()));
    shoeRepository.save(shoe);
  }

  @Transactional
  public void deleteShoe(UUID userId, Long shoeId) {
    Shoe shoe = shoeRepository.findByIdAndUser_Id(shoeId, userId)
        .orElseThrow(() -> ApiException.notFound("shoe_not_found"));
    // workout_session.shoe_id는 FK ON DELETE SET NULL — 러닝 기록은 보존, 귀속만 해제.
    shoeRepository.delete(shoe);
  }

  /** 활성 신발 전환 — 기존 활성을 먼저 해제하고(부분 유니크 인덱스 충돌 방지) 대상만 활성화한다. */
  @Transactional
  public void activateShoe(UUID userId, Long shoeId) {
    Shoe target = shoeRepository.findByIdAndUser_Id(shoeId, userId)
        .orElseThrow(() -> ApiException.notFound("shoe_not_found"));
    shoeRepository.findByUser_IdAndActiveTrue(userId).ifPresent(cur -> {
      if (!cur.getId().equals(shoeId)) {
        cur.deactivate();
        shoeRepository.saveAndFlush(cur);
      }
    });
    target.activate();
    shoeRepository.save(target);
  }

  /**
   * 러닝 저장 시 활성 신발에 귀속하고, 누적 거리가 교체 목표에 도달하면 교체 알림 이벤트를 발행한다.
   * WorkoutService의 저장 트랜잭션 안에서 호출된다(같은 트랜잭션이라 SUM 집계에 방금 저장한 러닝이 포함됨).
   */
  @Transactional
  public void attributeActiveShoe(UUID userId, WorkoutSession session) {
    Shoe active = shoeRepository.findByUser_IdAndActiveTrue(userId).orElse(null);
    if (active == null) return;
    session.assignShoe(active);

    Integer target = active.getTargetDistanceM();
    if (target == null || target <= 0) return;
    long total = workoutSessionRepository.sumDistanceByShoeId(active.getId());
    if (total >= target) {
      String totalKm = String.format("%.0f", total / 1000.0);
      eventPublisher.publishEvent(new WorkoutEvents.ShoeReplacementDueEvent(
          userId, active.getId(), active.displayName(), totalKm));
    }
  }

  /** 러닝 상세에서 신발 귀속을 변경/해제한다. shoeId가 null이면 해제. */
  @Transactional
  public void reassignWorkoutShoe(UUID userId, Long workoutId, Long shoeId) {
    WorkoutSession session = workoutSessionRepository.findByIdAndUserId(workoutId, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    Shoe shoe = null;
    if (shoeId != null) {
      shoe = shoeRepository.findByIdAndUser_Id(shoeId, userId)
          .orElseThrow(() -> ApiException.notFound("shoe_not_found"));
    }
    session.assignShoe(shoe);
    workoutSessionRepository.save(session);
  }

  private static String requireText(String value, int max, String errorCode) {
    if (value == null || value.trim().isEmpty()) throw ApiException.badRequest(errorCode);
    String trimmed = value.trim();
    if (trimmed.length() > max) throw ApiException.badRequest(errorCode);
    return trimmed;
  }

  private static String optionalText(String value, int max) {
    if (value == null || value.trim().isEmpty()) return null;
    String trimmed = value.trim();
    return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
  }

  private static Integer normalizeTarget(Integer target) {
    if (target == null || target <= 0) return null;
    if (target > MAX_TARGET_M) throw ApiException.badRequest("invalid_target");
    return target;
  }
}
