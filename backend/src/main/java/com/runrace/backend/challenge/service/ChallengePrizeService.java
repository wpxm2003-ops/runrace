package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.dto.PrizeItemRequest;
import com.runrace.backend.challenge.dto.PrizeRow;
import com.runrace.backend.challenge.domain.PrizeAwardType;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.event.ChallengeEvents;
import com.runrace.backend.upload.ImageUploadService;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
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
  private final ApplicationEventPublisher eventPublisher;

  /** 경품 목록 — 경품명·이미지 유무·수령 여부만. S3 키는 절대 반환하지 않는다. */
  @Transactional(readOnly = true)
  public List<PrizeRow> list(Long challengeId) {
    PrizeAwardType awardType = requireChallenge(challengeId).getPrizeAwardType();
    return prizeRepository.findByChallengeIdOrderByRank(challengeId).stream()
        .map(p -> new PrizeRow(
            p.getRank(),
            p.getName(),
            p.getImageKey() != null,
            p.getViewedAt() != null,
            awardType))
        .toList();
  }

  /** 경품 저장(전체 교체) — 생성자만, 레이스 시작 전만. 빈 목록 = 경품 전체 삭제. */
  @Transactional
  public void save(
      UUID userId, Long challengeId, PrizeAwardType awardType, List<PrizeItemRequest> items) {
    Challenge challenge = requireChallenge(challengeId);
    if (!challenge.isOwner(userId)) {
      throw ApiException.forbidden("not_creator");
    }
    if (!OffsetDateTime.now().isBefore(challenge.getStartAt())) {
      throw ApiException.badRequest("race_started");
    }
    challenge.setPrizeAwardType(awardType);
    challengeRepository.save(challenge);

    List<ChallengePrize> existing = prizeRepository.findByChallengeIdOrderByRank(challengeId);

    // 기존 이미지 키를 등수별로 맵핑
    Map<Integer, String> oldKeysByRank = new HashMap<>();
    for (ChallengePrize p : existing) {
      if (p.getImageKey() != null) oldKeysByRank.put(p.getRank(), p.getImageKey());
    }

    // 빈 목록 = 경품 전체 삭제
    if (items == null || items.isEmpty()) {
      prizeRepository.deleteByChallengeId(challengeId);
      // S3 삭제는 커밋 이후로 미룬다 — 트랜잭션 롤백 시 이미지만 지워지고 row는 남는 고아를 방지.
      ChallengeEvents.publishPrizeCleanup(eventPublisher, new ArrayList<>(oldKeysByRank.values()));
      return;
    }

    validate(items, challenge.getMaxMembers());

    // 저장 후 실제 사용될 S3 키 집합 계산
    Set<String> keptKeys = new HashSet<>();
    for (PrizeItemRequest it : items) {
      String kept = keptKey(it, oldKeysByRank);
      if (kept != null) keptKeys.add(kept);
    }

    // 재사용되지 않는 기존 이미지 = 고아 → 커밋 이후 정리(위와 동일 이유).
    List<String> orphanedKeys = new ArrayList<>();
    for (String oldKey : oldKeysByRank.values()) {
      if (!keptKeys.contains(oldKey)) orphanedKeys.add(oldKey);
    }

    prizeRepository.deleteByChallengeId(challengeId);
    for (PrizeItemRequest it : items) {
      prizeRepository.save(ChallengePrize.of(challengeId, it.rank(), it.name().trim(), keptKey(it, oldKeysByRank)));
    }
    ChallengeEvents.publishPrizeCleanup(eventPublisher, orphanedKeys);
  }

  private String keptKey(PrizeItemRequest it, Map<Integer, String> oldKeysByRank) {
    return keptKey(it, oldKeysByRank, imageUploadService::isPrivateKey);
  }

  /**
   * 이 항목에 실제 붙일 S3 키를 결정한다. (순수 함수 — 테스트 대상)
   * keepImage면 '원본 등수'(keepImageFromRank, 없으면 현재 rank)로 기존 이미지를 찾고,
   * 아니면 새로 업로드된 키를, 그것도 없으면 null(이미지 없음).
   * 재인덱싱된 현재 rank가 아니라 원본 등수로 매칭해 편집 중 순서 변경 시 이미지 뒤바뀜/유실을 막는다.
   */
  static String keptKey(
      PrizeItemRequest it, Map<Integer, String> oldKeysByRank, Predicate<String> isPrivateKey) {
    if (it.keepImage()) {
      int src = it.keepImageFromRank() != null ? it.keepImageFromRank() : it.rank();
      String old = oldKeysByRank.get(src);
      if (old != null) return old;
    }
    if (it.imageKey() != null && isPrivateKey.test(it.imageKey())) {
      return it.imageKey();
    }
    return null;
  }

  /**
   * 기프티콘 이미지.
   * - 생성자: 자기 레이스 경품 이미지를 편집용으로 언제든 미리볼 수 있다(자기가 올린 것 → 유출 아님). 수령 기록 안 함.
   * - 그 외: 레이스 종료 + 요청자의 final_rank == 경품 등수일 때만. 첫 열람 시 수령(viewed) 기록.
   */
  @Transactional
  public ImageUploadService.StoredImage getPrizeImage(UUID userId, Long challengeId, int rank) {
    Challenge challenge = requireChallenge(challengeId);
    ChallengePrize prize = prizeRepository.findByChallengeIdAndRank(challengeId, rank)
        .orElseThrow(() -> ApiException.notFound("prize_not_found"));
    if (prize.getImageKey() == null) {
      throw ApiException.notFound("no_prize_image");
    }

    if (challenge.isOwner(userId)) {
      return imageUploadService.loadPrivate(prize.getImageKey());
    }

    if (!challenge.isEnded()) {
      throw ApiException.forbidden("race_not_ended");
    }
    ChallengeMember member = challengeMemberRepository.findByChallengeIdAndUserId(challengeId, userId)
        .orElseThrow(() -> ApiException.forbidden("not_a_member"));
    boolean ownsPrize = challenge.getPrizeAwardType() == PrizeAwardType.RANDOM_FINISHER
        ? userId.equals(prize.getWinnerUserId())
        : member.getFinalRank() != null && member.getFinalRank() == rank;
    if (!ownsPrize) {
      throw ApiException.forbidden("not_your_prize");
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
