package com.runrace.backend.shoe.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class ShoeServiceTest {

  @Mock ShoeRepository shoeRepository;
  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock ApplicationEventPublisher eventPublisher;

  @InjectMocks ShoeService service;

  private final UUID userId = UUID.randomUUID();

  private AppUser user(UUID id) {
    return AppUser.builder().id(id).nickname("u").build();
  }

  private Shoe shoeFixture(long id, boolean active) {
    return Shoe.builder()
        .id(id)
        .user(user(userId))
        .brand("Nike")
        .model("Pegasus")
        .active(active)
        .createdAt(OffsetDateTime.now())
        .build();
  }

  private WorkoutSession sessionFixture() {
    return WorkoutSession.builder()
        .user(user(userId))
        .startedAt(OffsetDateTime.now())
        .endedAt(OffsetDateTime.now())
        .createdAt(OffsetDateTime.now())
        .pathJson("[]")
        .build();
  }

  // ── listShoes ────────────────────────────────────────────────────

  @Nested class ListShoes {
    @Test void 신발없으면_빈리스트_주행거리조회안함() {
      when(shoeRepository.findAllByUser_IdOrderByCreatedAtDesc(userId)).thenReturn(List.of());

      List<ShoeRow> rows = service.listShoes(userId);

      assertTrue(rows.isEmpty());
      verify(workoutSessionRepository, never()).sumDistanceByShoeForUser(any());
    }

    @Test void 신발있으면_주행거리매핑_없으면0() {
      Shoe s1 = shoeFixture(1L, true);
      Shoe s2 = shoeFixture(2L, false);
      when(shoeRepository.findAllByUser_IdOrderByCreatedAtDesc(userId)).thenReturn(List.of(s1, s2));
      WorkoutSessionRepository.ShoeMileageView view = new WorkoutSessionRepository.ShoeMileageView() {
        public Long getShoeId() { return 1L; }
        public long getTotalDistanceM() { return 12_345L; }
      };
      when(workoutSessionRepository.sumDistanceByShoeForUser(userId)).thenReturn(List.of(view));

      List<ShoeRow> rows = service.listShoes(userId);

      assertEquals(2, rows.size());
      assertEquals(12_345L, rows.get(0).totalDistanceM());
      assertEquals(0L, rows.get(1).totalDistanceM());
    }
  }

  // ── createShoe ───────────────────────────────────────────────────

  @Nested class CreateShoe {
    private final ShoeFormRequest validBody = new ShoeFormRequest("Nike", "Pegasus", null, null, null);

    @Test void 한도초과면_shoe_limit_reached() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(20L);
      ApiException ex = assertThrows(ApiException.class, () -> service.createShoe(userId, validBody));
      assertEquals("shoe_limit_reached", ex.code());
    }

    @Test void 브랜드비어있으면_invalid_brand() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(0L);
      ShoeFormRequest body = new ShoeFormRequest("   ", "Pegasus", null, null, null);
      ApiException ex = assertThrows(ApiException.class, () -> service.createShoe(userId, body));
      assertEquals("invalid_brand", ex.code());
    }

    @Test void 브랜드너무길면_invalid_brand() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(0L);
      ShoeFormRequest body = new ShoeFormRequest("a".repeat(41), "Pegasus", null, null, null);
      ApiException ex = assertThrows(ApiException.class, () -> service.createShoe(userId, body));
      assertEquals("invalid_brand", ex.code());
    }

    @Test void 모델비어있으면_invalid_model() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(0L);
      ShoeFormRequest body = new ShoeFormRequest("Nike", "", null, null, null);
      ApiException ex = assertThrows(ApiException.class, () -> service.createShoe(userId, body));
      assertEquals("invalid_model", ex.code());
    }

    @Test void target상한초과면_invalid_target() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(0L);
      ShoeFormRequest body = new ShoeFormRequest("Nike", "Pegasus", null, 2_000_001, null);
      ApiException ex = assertThrows(ApiException.class, () -> service.createShoe(userId, body));
      assertEquals("invalid_target", ex.code());
    }

    @Test void 저장시_트림값_전달_target0이하는_null로() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(1L);
      when(shoeRepository.save(any())).thenReturn(shoeFixture(1L, false));
      ShoeFormRequest body = new ShoeFormRequest("  Nike  ", "  Pegasus 41  ", "  My Shoe  ", 0, null);

      service.createShoe(userId, body);

      ArgumentCaptor<Shoe> captor = ArgumentCaptor.forClass(Shoe.class);
      verify(shoeRepository, times(1)).save(captor.capture());
      Shoe built = captor.getValue();
      assertEquals("Nike", built.getBrand());
      assertEquals("Pegasus 41", built.getModel());
      assertEquals("My Shoe", built.getNickname());
      assertNull(built.getTargetDistanceM());
    }

    @Test void 별명_공백만이면_null() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(1L);
      when(shoeRepository.save(any())).thenReturn(shoeFixture(1L, false));
      ShoeFormRequest body = new ShoeFormRequest("Nike", "Pegasus", "   ", null, null);

      service.createShoe(userId, body);

      ArgumentCaptor<Shoe> captor = ArgumentCaptor.forClass(Shoe.class);
      verify(shoeRepository).save(captor.capture());
      assertNull(captor.getValue().getNickname());
    }

    @Test void 두번째신발이고_활성요청안하면_비활성유지() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(1L);
      when(shoeRepository.save(any())).thenReturn(shoeFixture(101L, false));

      Shoe result = service.createShoe(userId, validBody);

      assertFalse(result.isActive());
      verify(shoeRepository, never()).findByUser_IdAndActiveTrue(any());
    }

    @Test void 첫신발이면_자동활성화() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(0L);
      Shoe saved = shoeFixture(100L, false);
      when(shoeRepository.save(any())).thenReturn(saved);
      when(shoeRepository.findByIdAndUser_Id(eq(100L), eq(userId))).thenReturn(Optional.of(saved));
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.empty());

      Shoe result = service.createShoe(userId, validBody);

      assertTrue(result.isActive());
    }

    @Test void 두번째신발이라도_active요청하면_기존활성_해제후_전환() {
      when(shoeRepository.countByUser_Id(userId)).thenReturn(1L);
      Shoe saved = shoeFixture(101L, false);
      when(shoeRepository.save(any())).thenReturn(saved);
      when(shoeRepository.findByIdAndUser_Id(eq(101L), eq(userId))).thenReturn(Optional.of(saved));
      Shoe existingActive = shoeFixture(50L, true);
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(existingActive));

      ShoeFormRequest activeBody = new ShoeFormRequest("Nike", "Pegasus", null, null, true);
      Shoe result = service.createShoe(userId, activeBody);

      assertTrue(result.isActive());
      assertFalse(existingActive.isActive());
      verify(shoeRepository).saveAndFlush(existingActive);
    }
  }

  // ── updateShoe ───────────────────────────────────────────────────

  @Nested class UpdateShoe {
    @Test void 존재하지않으면_shoe_not_found() {
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.empty());
      ShoeFormRequest body = new ShoeFormRequest("Nike", "Pegasus", null, null, null);
      ApiException ex = assertThrows(ApiException.class, () -> service.updateShoe(userId, 1L, body));
      assertEquals("shoe_not_found", ex.code());
    }

    @Test void 정상수정() {
      Shoe shoe = shoeFixture(1L, false);
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.of(shoe));
      ShoeFormRequest body = new ShoeFormRequest("Hoka", "Clifton", "새신발", 300_000, null);

      service.updateShoe(userId, 1L, body);

      assertEquals("Hoka", shoe.getBrand());
      assertEquals("Clifton", shoe.getModel());
      assertEquals("새신발", shoe.getNickname());
      assertEquals(300_000, shoe.getTargetDistanceM());
      verify(shoeRepository).save(shoe);
    }
  }

  // ── deleteShoe ───────────────────────────────────────────────────

  @Nested class DeleteShoe {
    @Test void 존재하지않으면_shoe_not_found() {
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.deleteShoe(userId, 1L));
      assertEquals("shoe_not_found", ex.code());
    }

    @Test void 정상삭제() {
      Shoe shoe = shoeFixture(1L, false);
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.of(shoe));

      service.deleteShoe(userId, 1L);

      verify(shoeRepository).delete(shoe);
    }
  }

  // ── activateShoe ─────────────────────────────────────────────────

  @Nested class ActivateShoe {
    @Test void 대상신발없으면_shoe_not_found() {
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.activateShoe(userId, 1L));
      assertEquals("shoe_not_found", ex.code());
    }

    @Test void 기존활성없으면_대상만활성화() {
      Shoe target = shoeFixture(1L, false);
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.of(target));
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.empty());

      service.activateShoe(userId, 1L);

      assertTrue(target.isActive());
      verify(shoeRepository, never()).saveAndFlush(any());
      verify(shoeRepository).save(target);
    }

    @Test void 기존활성이_동일신발이면_deactivate안함() {
      Shoe target = shoeFixture(1L, true);
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.of(target));
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(target));

      service.activateShoe(userId, 1L);

      assertTrue(target.isActive());
      verify(shoeRepository, never()).saveAndFlush(any());
    }

    @Test void 기존활성이_다른신발이면_기존비활성화후_전환() {
      Shoe target = shoeFixture(1L, false);
      Shoe current = shoeFixture(2L, true);
      when(shoeRepository.findByIdAndUser_Id(1L, userId)).thenReturn(Optional.of(target));
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(current));

      service.activateShoe(userId, 1L);

      assertTrue(target.isActive());
      assertFalse(current.isActive());
      verify(shoeRepository).saveAndFlush(current);
      verify(shoeRepository).save(target);
    }
  }

  // ── attributeActiveShoe ──────────────────────────────────────────

  @Nested class AttributeActiveShoe {
    @Test void 활성신발없으면_귀속안함() {
      WorkoutSession session = sessionFixture();
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.empty());

      service.attributeActiveShoe(userId, session);

      assertNull(session.getShoe());
      verify(eventPublisher, never()).publishEvent(any());
    }

    @Test void target없으면_이벤트없음() {
      WorkoutSession session = sessionFixture();
      Shoe active = shoeFixture(1L, true);
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(active));

      service.attributeActiveShoe(userId, session);

      assertEquals(active, session.getShoe());
      verify(eventPublisher, never()).publishEvent(any());
    }

    @Test void 누적거리가_target미달이면_이벤트없음() {
      WorkoutSession session = sessionFixture();
      Shoe active = shoeFixture(1L, true);
      active.edit(active.getBrand(), active.getModel(), null, 500_000);
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(active));
      when(workoutSessionRepository.sumDistanceByShoeId(1L)).thenReturn(400_000L);

      service.attributeActiveShoe(userId, session);

      verify(eventPublisher, never()).publishEvent(any());
    }

    @Test void 누적거리가_target도달하면_이벤트발행() {
      WorkoutSession session = sessionFixture();
      Shoe active = shoeFixture(1L, true);
      active.edit(active.getBrand(), active.getModel(), "애정템", 500_000);
      when(shoeRepository.findByUser_IdAndActiveTrue(userId)).thenReturn(Optional.of(active));
      when(workoutSessionRepository.sumDistanceByShoeId(1L)).thenReturn(500_400L);

      service.attributeActiveShoe(userId, session);

      ArgumentCaptor<WorkoutEvents.ShoeReplacementDueEvent> captor =
          ArgumentCaptor.forClass(WorkoutEvents.ShoeReplacementDueEvent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      WorkoutEvents.ShoeReplacementDueEvent event = captor.getValue();
      assertEquals(userId, event.userId());
      assertEquals(1L, event.shoeId());
      assertEquals("애정템", event.shoeName());
      assertEquals("500", event.totalKm());
    }
  }

  // ── reassignWorkoutShoe ──────────────────────────────────────────

  @Nested class ReassignWorkoutShoe {
    @Test void 운동없으면_workout_not_found() {
      when(workoutSessionRepository.findByIdAndUserId(1L, userId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.reassignWorkoutShoe(userId, 1L, 5L));
      assertEquals("workout_not_found", ex.code());
    }

    @Test void shoeId가_null이면_해제() {
      WorkoutSession session = sessionFixture();
      session.assignShoe(shoeFixture(1L, false));
      when(workoutSessionRepository.findByIdAndUserId(1L, userId)).thenReturn(Optional.of(session));

      service.reassignWorkoutShoe(userId, 1L, null);

      assertNull(session.getShoe());
      verify(workoutSessionRepository).save(session);
    }

    @Test void shoeId있는데_내신발아니면_shoe_not_found() {
      WorkoutSession session = sessionFixture();
      when(workoutSessionRepository.findByIdAndUserId(1L, userId)).thenReturn(Optional.of(session));
      when(shoeRepository.findByIdAndUser_Id(5L, userId)).thenReturn(Optional.empty());

      ApiException ex = assertThrows(ApiException.class,
          () -> service.reassignWorkoutShoe(userId, 1L, 5L));
      assertEquals("shoe_not_found", ex.code());
    }

    @Test void 정상재귀속() {
      WorkoutSession session = sessionFixture();
      Shoe shoe = shoeFixture(5L, false);
      when(workoutSessionRepository.findByIdAndUserId(1L, userId)).thenReturn(Optional.of(session));
      when(shoeRepository.findByIdAndUser_Id(5L, userId)).thenReturn(Optional.of(shoe));

      service.reassignWorkoutShoe(userId, 1L, 5L);

      assertEquals(shoe, session.getShoe());
      verify(workoutSessionRepository).save(session);
    }
  }
}
