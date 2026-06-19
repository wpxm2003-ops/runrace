package com.runrace.backend.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

  @Mock AppUserRepository appUserRepository;
  @Mock CacheManager cacheManager;

  @InjectMocks AccountService service;

  // ── updateNickname ───────────────────────────────────────────────────────

  @Nested class UpdateNickname {
    private final UUID userId = UUID.randomUUID();

    @Test void 닉네임_빈값이면_invalid_nickname() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateNickname(userId, "  "));
      assertEquals("invalid_nickname", ex.code());
    }

    @Test void 닉네임_21자_초과이면_invalid_nickname() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateNickname(userId, "a".repeat(21)));
      assertEquals("invalid_nickname", ex.code());
    }

    @Test void 다른_닉네임_이미_존재하면_nickname_taken() {
      AppUser user = AppUser.builder().id(userId).nickname("old").build();
      when(appUserRepository.getRequired(userId)).thenReturn(user);
      when(appUserRepository.existsByNickname("newname")).thenReturn(true);

      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateNickname(userId, "newname"));
      assertEquals("nickname_taken", ex.code());
    }

    @Test void 자기_닉네임_그대로면_중복_체크_안함() {
      AppUser user = AppUser.builder().id(userId).nickname("same").build();
      when(appUserRepository.getRequired(userId)).thenReturn(user);
      when(appUserRepository.saveAndFlush(user)).thenReturn(user);

      service.updateNickname(userId, "same");

      verify(appUserRepository, never()).existsByNickname(any());
    }

    @Test void 새_닉네임_중복없으면_저장() {
      AppUser user = AppUser.builder().id(userId).nickname("old").build();
      when(appUserRepository.getRequired(userId)).thenReturn(user);
      when(appUserRepository.existsByNickname("newname")).thenReturn(false);
      when(appUserRepository.saveAndFlush(user)).thenReturn(user);

      service.updateNickname(userId, "newname");

      verify(appUserRepository).saveAndFlush(user);
    }
  }

  // ── updateLanguage ───────────────────────────────────────────────────────

  @Nested class UpdateLanguage {
    private final UUID userId = UUID.randomUUID();

    @Test void 지원하지_않는_언어코드이면_invalid_lang_cd() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateLanguage(userId, "xx"));
      assertEquals("invalid_lang_cd", ex.code());
    }

    @Test void null_언어코드이면_invalid_lang_cd() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateLanguage(userId, null));
      assertEquals("invalid_lang_cd", ex.code());
    }

    @Test void 지원하는_언어코드_ko는_통과() {
      AppUser user = AppUser.builder().id(userId).nickname("nick").build();
      when(appUserRepository.getRequired(userId)).thenReturn(user);
      when(appUserRepository.save(user)).thenReturn(user);

      service.updateLanguage(userId, "ko");

      verify(appUserRepository).save(user);
    }

    @Test void 지원하는_언어코드_en은_통과() {
      AppUser user = AppUser.builder().id(userId).nickname("nick").build();
      when(appUserRepository.getRequired(userId)).thenReturn(user);
      when(appUserRepository.save(user)).thenReturn(user);

      service.updateLanguage(userId, "en");

      verify(appUserRepository).save(user);
    }
  }
}
