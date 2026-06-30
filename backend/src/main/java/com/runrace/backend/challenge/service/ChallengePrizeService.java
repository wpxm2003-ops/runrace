package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.dto.PrizeItemRequest;
import com.runrace.backend.challenge.dto.PrizeRow;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.upload.ImageUploadService;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 레이스 등수별 경품 — 등록(생성자·시작 전), 목록(이름 공개), 기프티콘 이미지(종료+해당 등수 게이트).
 */
@Service
@RequiredArgsConstructor
public class ChallengePrizeService {

  private static final int MAX_PRIZES = 10;
  private static final int MAX_NAME_LEN = 60;

  private final ChallengePrizeRepository prizeRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ImageUploadService imageUploadService;

  /** 경품 목록 — 경품명·이미지 유무·수령 여부만. S3 키는 절대 반환하지 않는다. */
  @Transactional(readOnly = true)
  public List<PrizeRow> list(Long challengeId) {
    requireChallenge(challengeId);
    return prizeRepository.findByChallengeIdOrderByRank(challengeId).stream()
        .map(p -> new PrizeRow(p.getRank(), p.getName(), p.getImageKey() != null, p.getViewedAt() != null))
        .toList();
  }

  /** 경품 저장(전체 교체) — 생성자만, 레이스 시작 전만. 빈 목록 = 경품 전체 삭제. */
  @Transactional
  public void save(UUID userId, Long challengeId, List<PrizeItemRequest> items) {
    Challenge challenge = requireChallenge(challengeId);
    if (!challenge.isOwner(userId)) {
      throw ApiException.forbidden("not_creator");
    }
    if (!OffsetDateTime.now().isBefore(challenge.getStartAt())) {
      throw ApiException.badRequest("race_started");
    }

    List<ChallengePrize> existing = prizeRepository.findByChallengeIdOrderByRank(challengeId);

    // 기존 이미지 키를 등수별로 맵핑
    Map<Integer, String> oldKeysByRank = new HashMap<>();
    for (ChallengePrize p : existing) {
      if (p.getImageKey() != null) oldKeysByRank.put(p.getRank(), p.getImageKey());
    }

    // 빈 목록 = 경품 전체 삭제
    if (items == null || items.isEmpty()) {
      oldKeysByRank.values().forEach(imageUploadService::deletePrivate);
      prizeRepository.deleteByChallengeId(challengeId);
      return;
    }

    validate(items, challenge.getMaxMembers());

    // 저장 후 실제 사용될 S3 키 집합 계산
    Set<String> keptKeys = new HashSet<>();
    for (PrizeItemRequest it : items) {
      if (it.keepImage() && oldKeysByRank.containsKey(it.rank())) {
        keptKeys.add(oldKeysByRank.get(it.rank()));
      } else if (it.imageKey() != null && imageUploadService.isPrivateKey(it.imageKey())) {
        keptKeys.add(it.imageKey());
      }
    }

    // 재사용되지 않는 기존 이미지 S3 삭제
    for (String oldKey : oldKeysByRank.values()) {
      if (!keptKeys.contains(oldKey)) {
        imageUploadService.deletePrivate(oldKey);
      }
    }

    prizeRepository.deleteByChallengeId(challengeId);
    for (PrizeItemRequest it : items) {
      String key;
      if (it.keepImage() && oldKeysByRank.containsKey(it.rank())) {
        key = oldKeysByRank.get(it.rank());
      } else if (it.imageKey() != null && imageUploadService.isPrivateKey(it.imageKey())) {
        key = it.imageKey();
      } else {
        key = null;
      }
      prizeRepository.save(ChallengePrize.of(challengeId, it.rank(), it.name().trim(), key));
    }
  }

  /**
   * 기프티콘 이미지 — 게이트: 레이스 종료 + 요청자의 final_rank == 경품 등수일 때만.
   * 첫 열람 시 수령(viewed) 기록.
   */
  @Transactional
  public ImageUploadService.StoredImage getPrizeImage(UUID userId, Long challengeId, int rank) {
    Challenge challenge = requireChallenge(challengeId);
    if (!challenge.isEnded()) {
      throw ApiException.forbidden("race_not_ended");
    }
    ChallengePrize prize = prizeRepository.findByChallengeIdAndRank(challengeId, rank)
        .orElseThrow(() -> ApiException.notFound("prize_not_found"));
    if (prize.getImageKey() == null) {
      throw ApiException.notFound("no_prize_image");
    }
    ChallengeMember member = challengeMemberRepository.findByChallengeIdAndUserId(challengeId, userId)
        .orElseThrow(() -> ApiException.forbidden("not_a_member"));
    if (member.getFinalRank() == null || member.getFinalRank() != rank) {
      throw ApiException.forbidden("not_your_rank");
    }
    if (prize.getViewedAt() == null) {
      prize.markViewed();
      prizeRepository.save(prize);
    }
    return imageUploadService.loadPrivate(prize.getImageKey());
  }

  private Challenge requireChallenge(Long challengeId) {
    return challengeRepository.findById(challengeId)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  private static void validate(List<PrizeItemRequest> items, int maxMembers) {
    if (items.size() > MAX_PRIZES) throw ApiException.badRequest("prizes_too_many");
    Set<Integer> ranks = new HashSet<>();
    for (PrizeItemRequest it : items) {
      if (it.name() == null || it.name().trim().isEmpty()) throw ApiException.badRequest("prize_name_required");
      if (it.name().trim().length() > MAX_NAME_LEN) throw ApiException.badRequest("prize_name_too_long");
      if (it.rank() < 1 || it.rank() > maxMembers) throw ApiException.badRequest("prize_rank_invalid");
      if (!ranks.add(it.rank())) throw ApiException.badRequest("prize_rank_duplicate");
    }
  }
}
