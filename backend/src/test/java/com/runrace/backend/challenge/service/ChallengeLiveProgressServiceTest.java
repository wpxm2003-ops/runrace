package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.dto.ChallengeLiveGaps;
import com.runrace.backend.challenge.dto.LiveProgressResponse;
import com.runrace.backend.challenge.dto.RivalGapRow;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.Distance;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 라이브(잠정) 진행률 핑 — opt-in 게이트, 불가능한 페이스 차단, 라이벌 격차 계산,
 * 그리고 확정 거리(total_km)를 건드리지 않는 쓰기 경로의 회귀 잠금.
 */
@ExtendWith(MockitoExtension.class)
class ChallengeLiveProgressServiceTest {

  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock RivalRepository rivalRepository;

  @InjectMocks ChallengeLiveProgressService service;

  private static final UUID ME_ID = UUID.randomUUID();
  /** 90초 동안 300m — 3.3m/s, 임계값(6.5m/s) 이내의 정상 페이스. */
  private static final int OK_ELAPSED_SEC = 90;
  /** 요청 순서 토큰 — 서버는 더 큰 값만 받아들인다. */
  private static final long SENT_AT = 1_787_000_000_000L;

  private static AppUser user(UUID id, String nickname, boolean livePublicOptIn) {
    return AppUser.builder().id(id).nickname(nickname).livePublicOptIn(livePublicOptIn).build();
  }

  private static ChallengeMember member(Challenge challenge, AppUser user, double totalKm) {
    return ChallengeMember.builder().id(UUID.randomUUID()).challenge(challenge).user(user)
        .totalKm(BigDecimal.valueOf(totalKm)).build();
  }

  private static ChallengeMember memberWithLive(
      Challenge challenge, AppUser user, double totalKm, double liveKm, OffsetDateTime liveAt) {
    return ChallengeMember.builder().id(UUID.randomUUID()).challenge(challenge).user(user)
        .totalKm(BigDecimal.valueOf(totalKm))
        .liveKm(BigDecimal.valueOf(liveKm)).liveUpdatedAt(liveAt).build();
  }

  /**
   * 활성 멤버 + 로스터 + 라이벌 목록을 한 번에 세운다.
   *
   * <p>서비스는 로스터 전체가 아니라 라이벌 멤버만 조회하므로, 호출부가 넘긴 roster에서
   * 라이벌에 해당하는 행만 걸러 돌려준다(실제 쿼리가 하는 일과 같게).
   */
  private void stub(List<ChallengeMember> mine, List<ChallengeMember> roster, List<UUID> rivals) {
    when(challengeMemberRepository.findAllActiveForUser(eq(ME_ID), any())).thenReturn(mine);
    if (!mine.isEmpty()) {
      when(rivalRepository.findRivalUserIds(ME_ID)).thenReturn(rivals);
      if (!rivals.isEmpty()) {
        when(challengeMemberRepository.findAllByChallengeIdInAndUserIdIn(any(), any()))
            .thenReturn(roster.stream()
                .filter(m -> rivals.contains(m.getUser().getId()))
                .toList());
      }
    }
  }

  private BigDecimal capturedLiveKm() {
    ArgumentCaptor<BigDecimal> live = ArgumentCaptor.forClass(BigDecimal.class);
    verify(challengeMemberRepository)
        .updateLiveProgress(any(), live.capture(), any(), any(), anyLong());
    return live.getValue();
  }

  // ── 입력 검증 ────────────────────────────────────────────────────────────

  @Test
  void 활성_챌린지가_없으면_빈_응답() {
    stub(List.of(), List.of(), List.of());

    LiveProgressResponse res = service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    assertEquals(List.of(), res.challenges());
  }

  @Test
  void 음수_거리는_거부() {
    ApiException ex =
        assertThrows(ApiException.class, () -> service.submit(ME_ID, -1, OK_ELAPSED_SEC, SENT_AT));
    assertEquals("distance_invalid", ex.code());
    verify(challengeMemberRepository, never()).findAllActiveForUser(any(), any());
  }

  @Test
  void 상한을_넘는_거리는_거부() {
    ApiException ex = assertThrows(
        ApiException.class,
        () -> service.submit(ME_ID, Distance.MAX_DISTANCE_M + 1, 24 * 3600, SENT_AT));
    assertEquals("distance_invalid", ex.code());
    verify(challengeMemberRepository, never()).findAllActiveForUser(any(), any());
  }

  @Test
  void 경과시간이_없으면_거부() {
    ApiException ex = assertThrows(ApiException.class, () -> service.submit(ME_ID, 300, 0, SENT_AT));
    assertEquals("duration_invalid", ex.code());
  }

  @Test
  void 첫_핑이어도_평균속도가_불가능하면_저장하지_않는다() {
    // 이전 라이브 값이 없어 델타 검사로는 걸리지 않는 케이스 — 러닝 시작부터의 평균으로 잡는다.
    // 10초에 5000m = 500m/s. 에러가 아니라 "저장 안 함"으로 처리한다(정직한 사용자의 GPS 튐도
    // 같은 경로를 타므로 응답 자체를 죽이지 않는다).
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 0.0);
    stub(List.of(mine), List.of(mine), List.of());

    LiveProgressResponse res = service.submit(ME_ID, 5000, 10, SENT_AT);

    verify(challengeMemberRepository, never()).updateLiveProgress(any(), any(), any(), any(), anyLong());
    assertEquals(1, res.challenges().size(), "저장은 막되 응답 자체는 정상 반환");
  }

  @Test
  void 라이브는_목표를_넘겨_진행률을_밀어_올리지_못한다() {
    // 조작된 큰 값이 들어와도 표시 가능한 최대치는 100%다.
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace =
        Challenge.builder().id(2L).crewId(99L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember mine = member(crewRace, me, 4.0); // 이미 4km 확정 — 남은 자리는 6km
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 100_000, 20_000, SENT_AT); // 100km, 5m/s — 속도 검증은 통과한다

    assertEquals(0, BigDecimal.valueOf(6).compareTo(capturedLiveKm()),
        "확정 4km + 라이브 6km = 목표 10km에서 멈춘다");
  }

  // ── opt-in 게이트 ────────────────────────────────────────────────────────

  @Test
  void 공개_레이스이고_opt_in_꺼져있으면_반영하지_않는다() {
    AppUser me = user(ME_ID, "me", false); // opt-out
    Challenge publicRace = Challenge.builder().id(1L).crewId(null).build();
    ChallengeMember mine = member(publicRace, me, 2.0);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository, never()).updateLiveProgress(any(), any(), any(), any(), anyLong());
  }

  @Test
  void 공개_레이스이고_opt_in_켜져있으면_반영한다() {
    AppUser me = user(ME_ID, "me", true);
    Challenge publicRace = Challenge.builder().id(1L).crewId(null).build();
    ChallengeMember mine = member(publicRace, me, 2.0);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    assertEquals(0, BigDecimal.valueOf(0.3).compareTo(capturedLiveKm()));
  }

  @Test
  void 크루_레이스는_공개_설정과_무관하게_기본으로_반영한다() {
    AppUser me = user(ME_ID, "me", false); // 공개는 opt-out이어도 크루는 기본 켜짐
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 2.0);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    assertEquals(0, BigDecimal.valueOf(0.3).compareTo(capturedLiveKm()));
  }

  @Test
  void 꺼진_축의_정리는_그_행만_건드린다() {
    // 회귀 잠금: 사용자 단위로 지우면 공개는 끄고 크루는 켠 사용자가 두 레이스에 동시 참여할 때
    // 꺼진 축을 처리하면서 같은 루프에서 방금 갱신한 크루 값까지 날아간다.
    AppUser me = AppUser.builder()
        .id(ME_ID).nickname("me").livePublicOptIn(false).liveCrewEnabled(true).build();
    Challenge publicRace = Challenge.builder().id(1L).crewId(null).build();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    // 공유를 끄기 전에 쌓인 값이 남아 있는 상태 — 지울 게 있어야 정리 쿼리가 나간다.
    ChallengeMember publicMine =
        memberWithLive(publicRace, me, 0.0, 1.2, OffsetDateTime.now().minusMinutes(1));
    ChallengeMember crewMine = member(crewRace, me, 0.0);
    stub(List.of(publicMine, crewMine), List.of(publicMine, crewMine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository)
        .discardLiveProgressForMember(publicMine.getId(), SENT_AT);
    verify(challengeMemberRepository, never())
        .discardLiveProgressForMember(eq(crewMine.getId()), anyLong());
    verify(challengeMemberRepository)
        .updateLiveProgress(eq(crewMine.getId()), any(), any(), any(), anyLong());
  }

  @Test
  void 이미_빈_행에는_정리_쿼리를_내지_않는다() {
    // 공개 공유는 기본이 꺼짐이라 대다수 사용자가 러닝 내내 이 분기를 탄다. 이미 빈 행이면
    // 0행 UPDATE라도 SQL 실행·인덱스 탐색·DB 왕복은 그대로 들어, 90초마다 쌓이면 낭비가 된다.
    AppUser me = user(ME_ID, "me", false); // 공개 공유 꺼짐
    Challenge publicRace = Challenge.builder().id(1L).crewId(null).build();
    ChallengeMember mine = member(publicRace, me, 2.0); // 라이브 값 없음
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository, never())
        .discardLiveProgressForMember(any(), anyLong());
    verify(challengeMemberRepository, never())
        .updateLiveProgress(any(), any(), any(), any(), anyLong());
  }

  @Test
  void 서버_시각보다_크게_앞선_순서_토큰은_거부() {
    // 이 값은 이후 모든 요청의 고수위로 저장되므로, 한 번만 들어와도 그때까지 전부 막힌다.
    long farFuture = System.currentTimeMillis() + 24 * 60 * 60 * 1000L;
    ApiException ex = assertThrows(
        ApiException.class, () -> service.submit(ME_ID, 300, OK_ELAPSED_SEC, farFuture));
    assertEquals("sent_at_invalid", ex.code());
    verify(challengeMemberRepository, never()).findAllActiveForUser(any(), any());
  }

  @Test
  void 크루_공유를_끄면_크루_레이스도_반영하지_않는다() {
    AppUser me = AppUser.builder()
        .id(ME_ID).nickname("me").livePublicOptIn(true).liveCrewEnabled(false).build();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 2.0);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository, never()).updateLiveProgress(any(), any(), any(), any(), anyLong());
  }

  @Test
  void 공개_설정과_크루_설정은_서로_독립이다() {
    // 공개만 켜고 크루를 끈 사용자가 두 레이스에 동시 참여 — 공개만 반영돼야 한다.
    AppUser me = AppUser.builder()
        .id(ME_ID).nickname("me").livePublicOptIn(true).liveCrewEnabled(false).build();
    Challenge publicRace = Challenge.builder().id(1L).crewId(null).build();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember publicMine = member(publicRace, me, 0.0);
    ChallengeMember crewMine = member(crewRace, me, 0.0);
    stub(List.of(publicMine, crewMine), List.of(publicMine, crewMine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository)
        .updateLiveProgress(eq(publicMine.getId()), any(), any(), any(), anyLong());
    verify(challengeMemberRepository, never())
        .updateLiveProgress(eq(crewMine.getId()), any(), any(), any(), anyLong());
  }

  // ── 쓰기 경로(확정 거리 보호) ────────────────────────────────────────────

  /**
   * 읽은 시점의 total_km을 낙관적 감시값으로 넘기는지 확인한다 — 그 사이 확정 반영이 끼어들면
   * 0행이 갱신돼 이미 확정된 거리 위에 라이브가 다시 얹히지 않는다.
   *
   * <p>한계: 이 테스트가 막지 못하는 사고가 하나 남는다 — 엔티티 필드를 변경하면 커밋 시
   * Hibernate dirty check가 <em>save() 호출 없이도</em> 전체 컬럼 UPDATE를 내보내 total_km을
   * 되돌린다. Mockito 단위 테스트에는 영속성 컨텍스트가 없어 그 flush를 관측할 수 없으므로,
   * 아래 never().save() 단언은 그 위험의 증명이 아니라 "쓰기 경로가 하나뿐"이라는 약한 신호일
   * 뿐이다. 실제 방어는 엔티티에 라이브 setter를 두지 않는 설계와 벌크 UPDATE 쿼리다.
   */
  @Test
  void 확정거리를_감시값으로_넘긴다() {
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 7.5);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    ArgumentCaptor<BigDecimal> expected = ArgumentCaptor.forClass(BigDecimal.class);
    verify(challengeMemberRepository)
        .updateLiveProgress(eq(mine.getId()), any(), any(), expected.capture(), anyLong());
    assertEquals(0, BigDecimal.valueOf(7.5).compareTo(expected.getValue()),
        "읽은 시점의 total_km을 낙관적 감시값으로 넘겨야 한다");
    verify(challengeMemberRepository, never()).save(any());
    verify(challengeMemberRepository, never()).saveAll(any());
  }

  @Test
  void 이전_핑_대비_불가능한_페이스면_조용히_무시한다() {
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    // 60초 전 0km에서 이번 1km → 16.7m/s. 단 러닝 전체 평균은 임계값 이내라 요청 검증은 통과한다.
    ChallengeMember mine =
        memberWithLive(crewRace, me, 0.0, 0.0, OffsetDateTime.now().minusSeconds(60));
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 1000, 600, SENT_AT);

    verify(challengeMemberRepository, never()).updateLiveProgress(any(), any(), any(), any(), anyLong());
  }

  @Test
  void 거리가_줄어드는_것은_항상_허용한다() {
    // 저장 없이 새 러닝을 시작하면 이번 distanceM이 이전 live_km보다 작을 수 있다 — 정당한 감소.
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine =
        memberWithLive(crewRace, me, 0.0, 5.0, OffsetDateTime.now().minusSeconds(60));
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 100, OK_ELAPSED_SEC, SENT_AT);

    assertEquals(0, BigDecimal.valueOf(0.1).compareTo(capturedLiveKm()));
  }

  // ── 라이벌 격차 ──────────────────────────────────────────────────────────

  @Test
  void 내_격차는_레이스_누적에_이번_런을_더한_값으로_계산한다() {
    // 회귀 잠금: 이번 런 거리만 쓰면 이미 누적 기록이 있는 사람은 그 누적분만큼 통째로 틀린다.
    AppUser me = user(ME_ID, "me", true);
    UUID rivalId = UUID.randomUUID();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 2.0); // 레이스에 이미 2000m 누적
    ChallengeMember rivalMember = member(crewRace, user(rivalId, "rival", true), 2.0); // 2000m
    stub(List.of(mine), List.of(mine, rivalMember), List.of(rivalId));

    LiveProgressResponse res = service.submit(ME_ID, 1500, 600, SENT_AT); // 이번 런 1500m

    RivalGapRow gap = res.challenges().get(0).rivalGaps().get(0);
    assertEquals(1500L, gap.gapM(), "(2000m 누적 + 1500m 이번런) - 2000m = +1500m");
  }

  @Test
  void 등록한_라이벌만_격차에_포함한다() {
    AppUser me = user(ME_ID, "me", true);
    UUID rivalId = UUID.randomUUID();
    UUID strangerId = UUID.randomUUID();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 0.0);
    ChallengeMember rivalMember = member(crewRace, user(rivalId, "rival", true), 2.0);
    ChallengeMember strangerMember = member(crewRace, user(strangerId, "stranger", true), 0.5);
    stub(List.of(mine), List.of(mine, rivalMember, strangerMember), List.of(rivalId));

    LiveProgressResponse res = service.submit(ME_ID, 1500, 600, SENT_AT);

    ChallengeLiveGaps gaps = res.challenges().get(0);
    assertEquals(2L, gaps.challengeId());
    assertEquals(1, gaps.rivalGaps().size(), "등록하지 않은 stranger는 제외");
    assertEquals(rivalId, gaps.rivalGaps().get(0).userId());
    assertEquals(-500L, gaps.rivalGaps().get(0).gapM(), "1500m - 2000m = -500m");
  }

  @Test
  void 신선한_라이브값이_있는_라이벌은_격차_계산에_합산된다() {
    AppUser me = user(ME_ID, "me", true);
    UUID rivalId = UUID.randomUUID();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 0.0);
    ChallengeMember rivalMember = memberWithLive(
        crewRace, user(rivalId, "rival", true), 1.0, 0.5, OffsetDateTime.now().minusMinutes(1));
    stub(List.of(mine), List.of(mine, rivalMember), List.of(rivalId));

    LiveProgressResponse res = service.submit(ME_ID, 1000, 600, SENT_AT);

    RivalGapRow gap = res.challenges().get(0).rivalGaps().get(0);
    assertEquals(-500L, gap.gapM(), "1000m - (1000m total + 500m live) = -500m");
  }

  @Test
  void 공유를_끈_라이벌의_지각_라이브값은_격차에서_제외한다() {
    // 설정 해제 직전에 시작된 핑이 정리 쿼리보다 늦게 반영돼도 읽기 시점 설정이 최종 경계다.
    AppUser me = user(ME_ID, "me", true);
    UUID rivalId = UUID.randomUUID();
    Challenge publicRace = Challenge.builder().id(2L).build();
    ChallengeMember mine = member(publicRace, me, 0.0);
    ChallengeMember optedOutRival = memberWithLive(
        publicRace, user(rivalId, "rival", false), 1.0, 0.5,
        OffsetDateTime.now().minusMinutes(1));
    stub(List.of(mine), List.of(mine, optedOutRival), List.of(rivalId));

    LiveProgressResponse res = service.submit(ME_ID, 1000, 600, SENT_AT);

    RivalGapRow gap = res.challenges().get(0).rivalGaps().get(0);
    assertEquals(0L, gap.gapM(), "공유를 끈 상대는 확정 1000m만 사용");
  }

  // ── 해제 ─────────────────────────────────────────────────────────────────

  @Test
  void 요청_순서_토큰을_함께_넘겨_지각_핑을_가릴_수_있게_한다() {
    // 종료 시 보낸 일시정지가 더 큰 토큰을 남기므로, 그보다 먼저 만들어진 지각 핑은
    // 쿼리 WHERE(liveSentAt < :sentAt)에서 떨궈진다. 여기서는 토큰이 전달되는지만 확인한다.
    AppUser me = user(ME_ID, "me", true);
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, me, 2.0);
    stub(List.of(mine), List.of(mine), List.of());

    service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    verify(challengeMemberRepository)
        .updateLiveProgress(eq(mine.getId()), any(), any(), any(), eq(SENT_AT));
  }

  @Test
  void discard는_거리까지_지운다() {
    // 저장하지 않기로 확정된 런 — 일시정지로 남기면 저장되지도 않을 거리가 15분간 보인다.
    AppUser me = user(ME_ID, "me", true);
    ChallengeMember mine = member(Challenge.builder().id(2L).crewId(99L).build(), me, 2.0);
    when(challengeMemberRepository.findAllActiveForUser(eq(ME_ID), any())).thenReturn(List.of(mine));

    service.discard(ME_ID, SENT_AT);

    verify(challengeMemberRepository).discardLiveProgressForMember(mine.getId(), SENT_AT);
    verify(challengeMemberRepository, never()).pauseLiveProgressForMember(any(), anyLong());
  }

  @Test
  void 과도한_경과시간은_거부() {
    // 상한이 없으면 아주 긴 경과를 불러 평균 속도 검증을 통째로 무력화할 수 있다.
    ApiException ex = assertThrows(
        ApiException.class,
        () -> service.submit(ME_ID, 300, Distance.MAX_DURATION_SEC + 1, SENT_AT));
    assertEquals("duration_invalid", ex.code());
    verify(challengeMemberRepository, never()).findAllActiveForUser(any(), any());
  }

  @Test
  void pause는_지우지_않고_활성_행만_일시정지로_표시한다() {
    // 거리를 지우면 남들 화면에서 진행바가 확정값까지 내려앉았다 재개 때 다시 올라간다.
    // 종료도 이 경로를 쓴다 — 확정 저장이 끝나기 전에 지우면 진행바가 뒷걸음질 친다.
    // 사용자 단위 벌크가 아니라 활성 행만 건드려야 한다(잠금 순서 계약·불필요한 행 회피).
    AppUser me = user(ME_ID, "me", true);
    ChallengeMember mine = member(Challenge.builder().id(2L).crewId(99L).build(), me, 2.0);
    when(challengeMemberRepository.findAllActiveForUser(eq(ME_ID), any())).thenReturn(List.of(mine));

    service.pause(ME_ID, SENT_AT);

    verify(challengeMemberRepository).pauseLiveProgressForMember(mine.getId(), SENT_AT);
    verify(challengeMemberRepository, never()).discardLiveProgressForMember(any(), anyLong());
  }

  @Test
  void 탈퇴한_계정의_핑은_반영하지_않는다() {
    // 자체 JWT는 폐기 목록이 없고 만료가 7일이라, 다른 기기에서 탈퇴해도 러닝 중인 기기의
    // 핑이 계속 통과해 탈퇴 정리가 지운 값을 되살린다.
    AppUser withdrawn = AppUser.builder()
        .id(ME_ID).nickname(null).livePublicOptIn(true)
        .withdrawnAt(OffsetDateTime.now().minusMinutes(1)).build();
    Challenge crewRace = Challenge.builder().id(2L).crewId(99L).build();
    ChallengeMember mine = member(crewRace, withdrawn, 2.0);
    when(challengeMemberRepository.findAllActiveForUser(eq(ME_ID), any())).thenReturn(List.of(mine));

    LiveProgressResponse res = service.submit(ME_ID, 300, OK_ELAPSED_SEC, SENT_AT);

    assertEquals(List.of(), res.challenges());
    verify(challengeMemberRepository, never()).updateLiveProgress(any(), any(), any(), any(), anyLong());
  }

  @Test
  void 라이벌_격차는_리더보드에_보이는_값과_같은_기준으로_계산한다() {
    // 저장·표시되는 라이브 값은 목표까지만 잘리므로 격차도 같은 기준을 써야 한다. 안 그러면
    // 배너가 남들 화면보다 큰 리드를 말한다. 대가로 목표를 넘긴 뒤에는 격차가 더 움직이지
    // 않지만, 그 시점엔 이미 완주라 배너의 의미도 사라진다 — 의도된 트레이드오프.
    AppUser me = user(ME_ID, "me", true);
    UUID rivalId = UUID.randomUUID();
    Challenge race =
        Challenge.builder().id(2L).crewId(99L).goalKm(BigDecimal.valueOf(10)).build();
    ChallengeMember mine = member(race, me, 0.0);
    ChallengeMember rivalMember = member(race, user(rivalId, "rival", true), 12.0);
    stub(List.of(mine), List.of(mine, rivalMember), List.of(rivalId));

    LiveProgressResponse res = service.submit(ME_ID, 11_000, 3_000, SENT_AT); // 11km — 목표 10km 초과

    assertEquals(-2000L, res.challenges().get(0).rivalGaps().get(0).gapM(),
        "잘린 10km 기준: 10km - 12km = -2000m (리더보드도 나를 10km로 보여준다)");
    assertEquals(0, BigDecimal.valueOf(10).compareTo(capturedLiveKm()),
        "저장되는 값도 목표까지만");
  }
}
