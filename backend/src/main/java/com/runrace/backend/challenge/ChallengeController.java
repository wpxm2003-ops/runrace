package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.dto.ActiveCountResponse;
import com.runrace.backend.challenge.dto.ChallengeDetailResponse;
import com.runrace.backend.challenge.dto.ChallengeListItem;
import com.runrace.backend.challenge.dto.CreateChallengeRequest;
import com.runrace.backend.challenge.dto.CreateChallengeResponse;
import com.runrace.backend.challenge.dto.MemberRow;
import com.runrace.backend.challenge.dto.UpdateChallengeRequest;
import com.runrace.backend.challenge.dto.WinnerRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/challenges")
@RequiredArgsConstructor
public class ChallengeController {
  private static final String ID_PATH = "[0-9]+";

  private final ChallengeService challengeService;

  @GetMapping("/active-count")
  public ResponseEntity<ActiveCountResponse> activeCount(AuthPrincipal principal) {
    long count = challengeService.countActiveRoomsForCreator(principal);
    return ResponseEntity.ok(
        new ActiveCountResponse(count, ChallengeService.MAX_ACTIVE_ROOMS_PER_CREATOR));
  }

  @PostMapping
  public ResponseEntity<CreateChallengeResponse> create(
      AuthPrincipal principal, @RequestBody CreateChallengeRequest body) {
    Challenge challenge =
        challengeService.createRoom(
            principal,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            LocalDate.parse(body.startDate()),
            LocalDate.parse(body.endDate()));
    return ResponseEntity.ok(new CreateChallengeResponse(challenge.getId()));
  }

  @PutMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<CreateChallengeResponse> update(
      AuthPrincipal principal, @PathVariable("id") Long id, @RequestBody UpdateChallengeRequest body) {
    Challenge challenge =
        challengeService.updateRoom(
            principal,
            id,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            LocalDate.parse(body.startDate()),
            LocalDate.parse(body.endDate()));
    return ResponseEntity.ok(new CreateChallengeResponse(challenge.getId()));
  }

  @DeleteMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> delete(AuthPrincipal principal, @PathVariable("id") Long id) {
    challengeService.deleteRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/join")
  public ResponseEntity<Void> join(AuthPrincipal principal, @PathVariable("id") Long id) {
    challengeService.joinRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping
  public ResponseEntity<List<ChallengeListItem>> list(Optional<AuthPrincipal> principal) {
    Optional<UUID> userId = principal.map(AuthPrincipal::userId);
    OffsetDateTime now = OffsetDateTime.now();
    List<ChallengeListItem> items =
        challengeService.listAll().stream()
            .map(challenge -> toListItem(challenge, now, userId))
            .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<ChallengeDetailResponse> detail(
      Optional<AuthPrincipal> principal, @PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail =
        challengeService.getDetail(principal.map(AuthPrincipal::userId), id);
    return ResponseEntity.ok(toDetailResponse(detail));
  }

  private ChallengeListItem toListItem(
      Challenge challenge, OffsetDateTime now, Optional<UUID> currentUserId) {
    ChallengePhase phase = ChallengePhase.of(challenge, now);
    boolean isOwner =
        currentUserId.map(uid -> challenge.getCreator().getId().equals(uid)).orElse(false);
    return new ChallengeListItem(
        challenge.getId(),
        challenge.getTitle(),
        challenge.getGoalKm(),
        phase.name(),
        challenge.getStartAt().toString(),
        toIsoOrNull(challenge.getEndAt()),
        challengeService.listMemberUserIds(challenge.getId()).size(),
        challenge.getCreatedAt().toString(),
        isOwner);
  }

  private ChallengeDetailResponse toDetailResponse(ChallengeService.ChallengeDetailView detail) {
    Challenge challenge = detail.challenge();
    BigDecimal goal = challengeService.goalKmAsDecimal(challenge);

    List<MemberRow> rows =
        detail.members().stream()
            .sorted(Comparator.comparing(ChallengeMember::getTotalKm).reversed())
            .map(member -> toMemberRow(member, challenge, goal))
            .toList();

    WinnerRow winner =
        detail.winner() == null
            ? null
            : new WinnerRow(detail.winner().getId(), detail.winner().getDisplayName());

    boolean showManage = detail.isOwner() && !detail.hasStarted();
    boolean canJoin =
        !detail.isMember()
            && !detail.hasStarted()
            && !detail.hasEnded()
            && detail.memberCount() < challenge.getMaxMembers();

    return new ChallengeDetailResponse(
        challenge.getId(),
        challenge.getTitle(),
        challenge.getGoalKm(),
        challenge.getMaxMembers(),
        challenge.getStartAt().toString(),
        toIsoOrNull(challenge.getEndAt()),
        challenge.getCreator().getId(),
        detail.currentUserId(),
        detail.isMember(),
        detail.isOwner(),
        detail.hasStarted(),
        detail.hasEnded(),
        showManage,
        canJoin,
        detail.memberCount(),
        winner,
        rows);
  }

  private MemberRow toMemberRow(ChallengeMember member, Challenge challenge, BigDecimal goal) {
    return new MemberRow(
        member.getUser().getId(),
        member.getUser().getDisplayName(),
        member.getUser().getPhotoUrl(),
        member.getTotalKm(),
        goal.subtract(member.getTotalKm()).max(BigDecimal.ZERO),
        challengeService.progressPercent(member, challenge),
        member.getFinishedAt() != null);
  }

  private static String toIsoOrNull(OffsetDateTime value) {
    return value != null ? value.toString() : null;
  }
}
