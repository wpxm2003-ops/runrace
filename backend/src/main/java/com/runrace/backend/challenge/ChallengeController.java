package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.user.AppUserRepository;
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
  private final com.runrace.backend.push.PushService pushService;
  private final com.runrace.backend.analytics.AnalyticsService analyticsService;
  private final AppUserRepository appUserRepository;

  @GetMapping("/active-count")
  public ResponseEntity<ActiveCountResponse> activeCount() {
    AuthPrincipal principal = AuthContext.getRequired();
    long count = challengeService.countActiveRoomsForCreator(principal);
    return ResponseEntity.ok(new ActiveCountResponse(count, 3));
  }

  @PostMapping
  public ResponseEntity<CreateChallengeResponse> create(@RequestBody CreateChallengeRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    Challenge c =
        challengeService.createRoom(
            principal,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            LocalDate.parse(body.startDate()),
            LocalDate.parse(body.endDate()));
    var me = appUserRepository.findById(principal.userId()).orElseThrow();
    analyticsService.track(me, "challenge.created", "{\"challengeId\":" + c.getId() + "}");
    var memberIds = challengeService.listMemberUserIds(c.getId());
    for (var uid : memberIds) {
      if (!uid.equals(principal.userId())) {
        pushService.sendToUserTokens(uid, "RunRace", "새 대결이 생성됐어요.");
      }
    }
    return ResponseEntity.ok(new CreateChallengeResponse(c.getId()));
  }

  @PutMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<CreateChallengeResponse> update(
      @PathVariable("id") Long id, @RequestBody UpdateChallengeRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    Challenge c =
        challengeService.updateRoom(
            principal,
            id,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            LocalDate.parse(body.startDate()),
            LocalDate.parse(body.endDate()));
    return ResponseEntity.ok(new CreateChallengeResponse(c.getId()));
  }

  @DeleteMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    AuthPrincipal principal = AuthContext.getRequired();
    challengeService.deleteRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/join")
  public ResponseEntity<Void> join(@PathVariable("id") Long id) {
    AuthPrincipal principal = AuthContext.getRequired();
    challengeService.joinRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping
  public ResponseEntity<List<ChallengeListItem>> list() {
    Optional<UUID> userId = AuthContext.userId();
    List<ChallengeListItem> items =
        challengeService.listAll().stream()
            .map(
                c -> {
                  OffsetDateTime now = OffsetDateTime.now();
                  ChallengePhase phase = ChallengePhase.of(c, now);
                  return new ChallengeListItem(
                      c.getId(),
                      c.getTitle(),
                      c.getGoalKm(),
                      phase.name(),
                      c.getStartAt().toString(),
                      c.getEndAt() != null ? c.getEndAt().toString() : null,
                      challengeService.listMemberUserIds(c.getId()).size(),
                      c.getCreatedAt().toString(),
                      userId.isPresent() && c.getCreator().getId().equals(userId.get()));
                })
            .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<ChallengeDetailResponse> detail(@PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail =
        challengeService.getDetail(AuthContext.userId(), id);
    Challenge c = detail.challenge();
    BigDecimal goal = challengeService.goalKmAsDecimal(c);

    List<MemberRow> rows =
        detail.members().stream()
            .sorted(Comparator.comparing(ChallengeMember::getTotalKm).reversed())
            .map(
                cm ->
                    new MemberRow(
                        cm.getUser().getId(),
                        cm.getUser().getDisplayName(),
                        cm.getUser().getPhotoUrl(),
                        cm.getTotalKm(),
                        goal.subtract(cm.getTotalKm()).max(BigDecimal.ZERO),
                        challengeService.progressPercent(cm, c),
                        cm.getFinishedAt() != null))
            .toList();

    WinnerRow winnerRow = null;
    if (detail.winner() != null) {
      winnerRow =
          new WinnerRow(detail.winner().getId(), detail.winner().getDisplayName());
    }

    boolean showManage = detail.isOwner() && !detail.hasStarted();
    boolean canJoin =
        !detail.isMember()
            && !detail.hasStarted()
            && !detail.hasEnded()
            && detail.memberCount() < c.getMaxMembers();

    return ResponseEntity.ok(
        new ChallengeDetailResponse(
            c.getId(),
            c.getTitle(),
            c.getGoalKm(),
            c.getMaxMembers(),
            c.getStartAt().toString(),
            c.getEndAt() != null ? c.getEndAt().toString() : null,
            c.getCreator().getId(),
            detail.currentUserId(),
            detail.isMember(),
            detail.isOwner(),
            detail.hasStarted(),
            detail.hasEnded(),
            showManage,
            canJoin,
            detail.memberCount(),
            winnerRow,
            rows));
  }

  public record ActiveCountResponse(long activeCount, int maxActive) {}

  public record CreateChallengeRequest(
      String title, int goalKm, int maxMembers, String startDate, String endDate) {}

  public record UpdateChallengeRequest(
      String title, int goalKm, int maxMembers, String startDate, String endDate) {}

  public record CreateChallengeResponse(Long id) {}

  public record ChallengeListItem(
      Long id,
      String title,
      int goalKm,
      String phase,
      String startAt,
      String endAt,
      int memberCount,
      String createdAt,
      boolean isOwner) {}

  public record ChallengeDetailResponse(
      Long id,
      String title,
      int goalKm,
      int maxMembers,
      String startAt,
      String endAt,
      UUID creatorUserId,
      UUID currentUserId,
      boolean isMember,
      boolean isOwner,
      boolean hasStarted,
      boolean hasEnded,
      boolean showManage,
      boolean canJoin,
      int memberCount,
      WinnerRow winner,
      List<MemberRow> members) {}

  public record WinnerRow(UUID userId, String displayName) {}

  public record MemberRow(
      UUID userId,
      String displayName,
      String photoUrl,
      BigDecimal totalKm,
      BigDecimal remainingKm,
      BigDecimal progressPercent,
      boolean finished) {}
}
