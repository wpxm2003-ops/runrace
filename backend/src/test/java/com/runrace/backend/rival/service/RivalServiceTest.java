package com.runrace.backend.rival.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RivalServiceTest {

  @Mock RivalRepository rivalRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;

  @InjectMocks RivalService service;

  // ── addRival ─────────────────────────────────────────────────────────────

  @Nested class AddRival {
    private final UUID meId = UUID.randomUUID();

    @Test void 빈_닉네임이면_invalid_nickname() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.addRival(meId, "  "));
      assertEquals("invalid_nickname", ex.code());
    }

    @Test void null_닉네임이면_invalid_nickname() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.addRival(meId, null));
      assertEquals("invalid_nickname", ex.code());
    }

    @Test void 존재하지_않는_닉네임이면_user_not_found() {
      when(appUserRepository.findByNickname("unknown")).thenReturn(Optional.empty());

      ApiException ex = assertThrows(ApiException.class,
          () -> service.addRival(meId, "unknown"));
      assertEquals("user_not_found", ex.code());
    }

    @Test void 본인_등록이면_cannot_add_self() {
      AppUser me = AppUser.builder().id(meId).nickname("me").build();
      when(appUserRepository.findByNickname("me")).thenReturn(Optional.of(me));

      ApiException ex = assertThrows(ApiException.class,
          () -> service.addRival(meId, "me"));
      assertEquals("cannot_add_self", ex.code());
    }

    @Test void 이미_등록된_라이벌이면_already_rival() {
      UUID targetId = UUID.randomUUID();
      AppUser target = AppUser.builder().id(targetId).nickname("rival").build();
      when(appUserRepository.findByNickname("rival")).thenReturn(Optional.of(target));
      when(rivalRepository.existsByUserIdAndRivalUserId(meId, targetId)).thenReturn(true);

      ApiException ex = assertThrows(ApiException.class,
          () -> service.addRival(meId, "rival"));
      assertEquals("already_rival", ex.code());
    }

    @Test void 정상_등록은_저장_호출() {
      UUID targetId = UUID.randomUUID();
      AppUser me = AppUser.builder().id(meId).nickname("me").build();
      AppUser target = AppUser.builder().id(targetId).nickname("rival").build();
      when(appUserRepository.findByNickname("rival")).thenReturn(Optional.of(target));
      when(rivalRepository.existsByUserIdAndRivalUserId(meId, targetId)).thenReturn(false);
      when(appUserRepository.getRequired(meId)).thenReturn(me);

      service.addRival(meId, "rival");

      verify(rivalRepository).save(any());
    }
  }

  // ── removeRival ──────────────────────────────────────────────────────────

  @Nested class RemoveRival {
    @Test void 라이벌_해제는_삭제_위임() {
      UUID meId = UUID.randomUUID();
      UUID rivalId = UUID.randomUUID();

      service.removeRival(meId, rivalId);

      verify(rivalRepository).deleteByUserIdAndRivalUserId(meId, rivalId);
    }

    @Test void 없는_라이벌_해제해도_예외없음() {
      UUID meId = UUID.randomUUID();
      UUID rivalId = UUID.randomUUID();
      // deleteBy…는 결과 없어도 예외 없음 — 정상 통과 확인
      service.removeRival(meId, rivalId);
      verify(rivalRepository).deleteByUserIdAndRivalUserId(meId, rivalId);
    }
  }
}
