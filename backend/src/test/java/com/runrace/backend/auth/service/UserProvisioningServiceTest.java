package com.runrace.backend.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class UserProvisioningServiceTest {

  @Mock AppUserRepository appUserRepository;
  @Mock UserInsertTx userInsertTx;

  @InjectMocks UserProvisioningService service;

  private final String firebaseUid = "firebase:abc";

  private AppUser existing(String email, String displayName, String provider) {
    return AppUser.builder()
        .id(UUID.randomUUID())
        .firebaseUid(firebaseUid)
        .email(email)
        .displayName(displayName)
        .provider(provider)
        .nickname("기존닉")
        .createdAt(OffsetDateTime.now())
        .build();
  }

  // ── 기존 사용자 upsert ───────────────────────────────────────────

  @Nested class ExistingUser {
    @Test void 변경없으면_저장안하고_그대로반환() {
      AppUser user = existing("e@x.com", "철수", "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));

      AppUser result = service.upsert(firebaseUid, "e@x.com", "철수", "google", true, "ko");

      assertSame(user, result);
      verify(appUserRepository, never()).save(any());
    }

    @Test void 이메일과이름이변경되면_업데이트후저장() {
      AppUser user = existing("old@x.com", "Old", "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));
      when(appUserRepository.save(user)).thenReturn(user);

      service.upsert(firebaseUid, "new@x.com", "New", "google", true, "ko");

      assertEquals("new@x.com", user.getEmail());
      assertEquals("New", user.getDisplayName());
      verify(appUserRepository).save(user);
    }

    @Test void 이름이빈값으로들어오면_기존이름유지() {
      AppUser user = existing("old@x.com", "기존이름", "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));
      when(appUserRepository.save(user)).thenReturn(user);

      // 이메일은 바뀌어 저장은 발생하되, 이름은 blank라 기존값 유지돼야 한다.
      service.upsert(firebaseUid, "new@x.com", "   ", "google", true, "ko");

      assertEquals("기존이름", user.getDisplayName());
    }

    @Test void 이메일이null로들어오면_기존이메일유지() {
      AppUser user = existing("old@x.com", "이름", "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));
      when(appUserRepository.save(user)).thenReturn(user);

      service.upsert(firebaseUid, null, "새이름", "google", true, "ko");

      assertEquals("old@x.com", user.getEmail());
    }

    @Test void provider가custom으로들어오면_기존provider유지() {
      // 카카오 로그인은 Firebase 커스텀 토큰이라 sign_in_provider가 "custom"으로 넘어온다.
      AppUser user = existing("e@x.com", "이름", "kakao");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));
      when(appUserRepository.save(user)).thenReturn(user);

      service.upsert(firebaseUid, "e@x.com", "새이름", "custom", true, "ko");

      assertEquals("kakao", user.getProvider());
    }

    @Test void provider가실제값으로들어오면_교체() {
      AppUser user = existing("e@x.com", "이름", "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.of(user));
      when(appUserRepository.save(user)).thenReturn(user);

      service.upsert(firebaseUid, "e@x.com", "이름", "apple", true, "ko");

      assertEquals("apple", user.getProvider());
    }
  }

  // ── 신규/병합 ────────────────────────────────────────────────────

  @Nested class NewUserOrMerge {
    @Test void 검증된이메일로_기존계정있으면_병합() {
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.empty());
      AppUser byEmail = existing("shared@x.com", "기존", "google");
      when(appUserRepository.findByEmail("shared@x.com")).thenReturn(Optional.of(byEmail));
      when(appUserRepository.save(byEmail)).thenReturn(byEmail);

      AppUser result = service.upsert(firebaseUid, "shared@x.com", "새이름", "google", true, "ko");

      assertSame(byEmail, result);
      assertEquals(firebaseUid, byEmail.getFirebaseUid());
      verify(userInsertTx, never()).insert(any());
    }

    @Test void 이메일미검증이면_병합하지않고_새로생성() {
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.empty());
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(false);
      AppUser created = existing("shared@x.com", "새이름", "google");
      when(userInsertTx.insert(any())).thenReturn(created);

      service.upsert(firebaseUid, "shared@x.com", "새이름", "google", false, "ko");

      verify(appUserRepository, never()).findByEmail(any());
      verify(userInsertTx).insert(any());
    }

    @Test void 이메일없으면_새로생성() {
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.empty());
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(false);
      AppUser created = existing(null, "새이름", "google");
      when(userInsertTx.insert(any())).thenReturn(created);

      AppUser result = service.upsert(firebaseUid, null, "새이름", "google", false, "ko");

      assertSame(created, result);
      verify(appUserRepository, never()).findByEmail(any());
    }
  }

  // ── 신규 생성 시 닉네임 충돌/경쟁 처리 ────────────────────────────

  @Nested class NicknameCollision {
    @Test void 닉네임이미존재하면_다음후보로재시도() {
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.empty());
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(true, false);
      AppUser created = existing(null, null, "google");
      when(userInsertTx.insert(any())).thenReturn(created);

      AppUser result = service.upsert(firebaseUid, null, null, "google", false, "ko");

      assertSame(created, result);
      verify(appUserRepository, times(2)).existsByNicknameAndWithdrawnAtIsNull(any());
      verify(userInsertTx, times(1)).insert(any());
    }

    @Test void 동시가입으로_같은uid행이미있으면_그행회수() {
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(false);
      when(userInsertTx.insert(any())).thenThrow(new DataIntegrityViolationException("dup"));
      AppUser racedRow = existing(null, null, "google");
      when(appUserRepository.findByFirebaseUid(firebaseUid))
          .thenReturn(Optional.empty(), Optional.of(racedRow));

      AppUser result = service.upsert(firebaseUid, null, null, "google", false, "ko");

      assertSame(racedRow, result);
      verify(userInsertTx, times(1)).insert(any());
    }

    @Test void 동시가입이지만_같은uid없으면_닉네임재시도() {
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(false);
      AppUser created = existing(null, null, "google");
      when(userInsertTx.insert(any()))
          .thenThrow(new DataIntegrityViolationException("dup"))
          .thenReturn(created);
      when(appUserRepository.findByFirebaseUid(firebaseUid))
          .thenReturn(Optional.empty(), Optional.empty());

      AppUser result = service.upsert(firebaseUid, null, null, "google", false, "ko");

      assertSame(created, result);
      verify(userInsertTx, times(2)).insert(any());
    }

    @Test void 모든시도실패하면_nickname_unavailable() {
      when(appUserRepository.findByFirebaseUid(firebaseUid)).thenReturn(Optional.empty());
      when(appUserRepository.existsByNicknameAndWithdrawnAtIsNull(any())).thenReturn(false);
      when(userInsertTx.insert(any())).thenThrow(new DataIntegrityViolationException("dup"));

      ApiException ex = assertThrows(ApiException.class,
          () -> service.upsert(firebaseUid, null, null, "google", false, "ko"));

      assertEquals("nickname_unavailable", ex.code());
      verify(userInsertTx, times(10)).insert(any());
    }
  }
}
