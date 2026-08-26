package com.runrace.backend.challenge.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 라이브(잠정) 진행률 도메인 로직 — 신선도 판정과 total_km 합산의 단일 출처.
 *
 * <p>라이브 값 설정 메서드가 엔티티에 없는 것은 의도다(벌크 UPDATE 전용 경로) — 픽스처는
 * 빌더로 직접 세운다.
 */
class ChallengeMemberTest {

  private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-01-01T00:00:00Z");

  private static ChallengeMember member(double totalKm) {
    return ChallengeMember.builder().totalKm(BigDecimal.valueOf(totalKm)).build();
  }

  private static ChallengeMember withLive(double totalKm, double liveKm, OffsetDateTime liveAt) {
    return ChallengeMember.builder()
        .totalKm(BigDecimal.valueOf(totalKm))
        .liveKm(BigDecimal.valueOf(liveKm))
        .liveUpdatedAt(liveAt)
        .build();
  }

  @Nested class LiveFreshness {
    @Test void 라이브_값_없으면_신선하지_않음() {
      assertFalse(member(5).isLiveFresh(NOW));
    }

    @Test void 신선도_윈도_이내면_신선() {
      assertTrue(withLive(5, 1, NOW.minusMinutes(14)).isLiveFresh(NOW));
    }

    @Test void 신선도_윈도_초과면_신선하지_않음() {
      assertFalse(withLive(5, 1, NOW.minusMinutes(16)).isLiveFresh(NOW));
    }

    @Test void 정확히_경계값() {
      ChallengeMember m = withLive(5, 1, NOW.minus(ChallengeMember.LIVE_FRESH_WINDOW));
      assertTrue(m.isLiveFresh(NOW), "경계값(정확히 15분 전)은 신선으로 취급");
    }
  }

  @Nested class LivePaused {
    private static ChallengeMember paused(double totalKm, double liveKm, OffsetDateTime at) {
      return ChallengeMember.builder()
          .totalKm(BigDecimal.valueOf(totalKm))
          .liveKm(BigDecimal.valueOf(liveKm))
          .liveUpdatedAt(at)
          .livePaused(true)
          .build();
    }

    @Test void 일시정지여도_거리는_유지된다() {
      // 지우면 남들 화면에서 진행바가 확정값까지 내려앉았다 재개 때 다시 올라간다.
      ChallengeMember m = paused(5, 1.5, NOW.minusMinutes(1));
      assertEquals(0, BigDecimal.valueOf(6.5).compareTo(m.effectiveTotalKm(NOW)));
    }

    @Test void 일시정지면_러닝중_표시에서_빠진다() {
      assertFalse(paused(5, 1.5, NOW.minusMinutes(1)).isLiveRunning(NOW));
    }

    @Test void 일시정지가_아니면_러닝중() {
      assertTrue(withLive(5, 1.5, NOW.minusMinutes(1)).isLiveRunning(NOW));
    }

    @Test void 신선하지_않으면_일시정지_여부와_무관하게_러닝중_아님() {
      assertFalse(paused(5, 1.5, NOW.minusMinutes(20)).isLiveRunning(NOW));
      assertFalse(withLive(5, 1.5, NOW.minusMinutes(20)).isLiveRunning(NOW));
    }

    @Test void clearLiveProgress는_순서_토큰을_건드리지_않는다() {
      // 회귀 잠금: 토큰은 클라이언트 시각으로 래칫되는 값이라, 서버가 올리면 시계가 느린
      // 기기의 다음 런이 스큐만큼 통째로 막힌다(200을 받아 실패도 못 알아챈다).
      ChallengeMember m = ChallengeMember.builder()
          .totalKm(BigDecimal.valueOf(5)).liveSentAt(1_000L).build();

      m.clearLiveProgress();

      assertEquals(1_000L, m.getLiveSentAt());
    }

    @Test void clearLiveProgress는_일시정지_플래그도_되돌린다() {
      ChallengeMember m = paused(5, 1.5, NOW.minusMinutes(1));
      m.clearLiveProgress();
      assertFalse(m.isLivePaused());
    }
  }

  @Nested class SharesLive {
    private static ChallengeMember withUser(AppUser u) {
      return ChallengeMember.builder().totalKm(BigDecimal.ZERO).user(u).build();
    }

    @Test void 공개_레이스는_공개_동의를_본다() {
      assertTrue(withUser(AppUser.builder().livePublicOptIn(true).build()).sharesLive(false));
      assertFalse(withUser(AppUser.builder().livePublicOptIn(false).build()).sharesLive(false));
    }

    @Test void 크루_레이스는_크루_설정을_본다() {
      // 공개는 꺼도 크루는 기본 켜짐 — 두 축이 독립이다.
      AppUser u = AppUser.builder().livePublicOptIn(false).liveCrewEnabled(true).build();
      assertTrue(withUser(u).sharesLive(true));
      assertFalse(withUser(u).sharesLive(false));
    }

    @Test void 탈퇴한_계정은_어느_축에서도_보여주지_않는다() {
      AppUser u = AppUser.builder()
          .livePublicOptIn(true).liveCrewEnabled(true)
          .withdrawnAt(OffsetDateTime.parse("2026-01-01T00:00:00Z")).build();
      assertFalse(withUser(u).sharesLive(true));
      assertFalse(withUser(u).sharesLive(false));
    }
  }

  @Nested class EffectiveTotalKm {
    @Test void 신선하면_total과_live를_합산() {
      ChallengeMember m = withLive(5, 1.5, NOW.minusMinutes(1));
      assertEquals(0, BigDecimal.valueOf(6.5).compareTo(m.effectiveTotalKm(NOW)));
    }

    @Test void 신선하지_않으면_raw_total_km만() {
      ChallengeMember m = withLive(5, 1.5, NOW.minusMinutes(20));
      assertEquals(0, BigDecimal.valueOf(5).compareTo(m.effectiveTotalKm(NOW)));
    }

    @Test void clearLiveProgress_이후에는_raw_total_km만_이중합산_방지() {
      ChallengeMember m = withLive(5, 1.5, NOW.minusMinutes(1));

      m.clearLiveProgress();

      assertNull(m.getLiveKm());
      assertNull(m.getLiveUpdatedAt());
      assertEquals(0, BigDecimal.valueOf(5).compareTo(m.effectiveTotalKm(NOW)));
    }
  }
}
