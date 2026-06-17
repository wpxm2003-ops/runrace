package com.runrace.backend.rival.service;

import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.rival.domain.Rival;
import com.runrace.backend.rival.dto.RivalRow;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 라이벌(팔로우식 단방향) 관리 + 라이벌별 전적 집계.
 * 전적은 {@code challenge_member.final_rank} self-join으로 도출(별도 집계 테이블 없음).
 */
@Service
@RequiredArgsConstructor
public class RivalService {
  private final RivalRepository rivalRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeMemberRepository challengeMemberRepository;

  /** 내 라이벌 목록(최근 등록 순) + 각 라이벌과의 누적 전적. */
  @Transactional(readOnly = true)
  public List<RivalRow> listRivals(UUID meId) {
    List<Rival> rivals = rivalRepository.findAllByUserId(meId);
    if (rivals.isEmpty()) {
      return List.of();
    }
    List<UUID> rivalIds = rivals.stream().map(r -> r.getRivalUser().getId()).toList();
    Map<UUID, int[]> record = headToHeadRecord(meId, rivalIds);
    return rivals.stream()
        .map(r -> {
          AppUser ru = r.getRivalUser();
          int[] wl = record.getOrDefault(ru.getId(), new int[] {0, 0});
          return new RivalRow(ru.getId(), ru.getNickname(), wl[0], wl[1]);
        })
        .toList();
  }

  /** 닉네임으로 라이벌 등록. 본인·미존재·중복은 막는다. */
  @Transactional
  public void addRival(UUID meId, String nickname) {
    if (nickname == null || nickname.trim().isEmpty()) {
      throw ApiException.badRequest("invalid_nickname");
    }
    AppUser target =
        appUserRepository
            .findByNickname(nickname.trim())
            .orElseThrow(() -> ApiException.notFound("user_not_found"));
    if (target.getId().equals(meId)) {
      throw ApiException.badRequest("cannot_add_self");
    }
    if (rivalRepository.existsByUserIdAndRivalUserId(meId, target.getId())) {
      throw ApiException.conflict("already_rival");
    }
    AppUser me = appUserRepository.getRequired(meId);
    rivalRepository.save(
        Rival.builder().user(me).rivalUser(target).createdAt(OffsetDateTime.now()).build());
  }

  /** 라이벌 해제(단방향). */
  @Transactional
  public void removeRival(UUID meId, UUID rivalUserId) {
    rivalRepository.deleteByUserIdAndRivalUserId(meId, rivalUserId);
  }

  /** meId 기준 상대별 [승, 패] 집계. */
  private Map<UUID, int[]> headToHeadRecord(UUID meId, List<UUID> opponentIds) {
    Map<UUID, int[]> agg = new HashMap<>();
    for (var pair : challengeMemberRepository.findHeadToHeadPairs(meId, opponentIds)) {
      int[] wl = agg.computeIfAbsent(pair.opponentId(), k -> new int[2]);
      if (pair.myRank() < pair.opRank()) {
        wl[0]++;
      } else if (pair.myRank() > pair.opRank()) {
        wl[1]++;
      }
    }
    return agg;
  }
}
