package com.runrace.backend.feedback.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.feedback.domain.Feedback;
import com.runrace.backend.feedback.dto.CreateFeedbackRequest;
import com.runrace.backend.feedback.repository.FeedbackRepository;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FeedbackService {
  private static final Set<String> TYPES = Set.of("IDEA", "INCONVENIENCE", "BUG", "ETC");

  private final FeedbackRepository feedbackRepository;
  private final AppUserRepository appUserRepository;
  private final ImageUploadService imageUploadService;
  private final ObjectMapper objectMapper;

  @Transactional
  public Long create(UUID userId, CreateFeedbackRequest request) {
    if (request == null || request.type() == null || !TYPES.contains(request.type())) {
      throw ApiException.badRequest("invalid_feedback_type");
    }
    String title = requiredText(request.title(), 120, "invalid_feedback_title");
    String content = requiredText(request.content(), 5000, "invalid_feedback_content");
    List<String> imageUrls = request.imageUrls() == null ? List.of() : request.imageUrls();
    if (imageUrls.size() > 3
        || imageUrls.stream().anyMatch(url -> !imageUploadService.isStoredUrl(url))) {
      throw ApiException.badRequest("invalid_feedback_images");
    }

    AppUser user = appUserRepository.getRequired(userId);
    Feedback feedback = Feedback.create(
        userId,
        firstPresent(user.getDisplayName(), user.getNickname()),
        request.type(),
        title,
        content,
        toJson(imageUrls),
        boundedOptional(request.pageUrl(), 1000, "invalid_feedback_page_url"),
        boundedOptional(request.userAgent(), 1000, "invalid_feedback_user_agent"),
        boundedOptional(request.appVersion(), 50, "invalid_feedback_app_version"));
    return feedbackRepository.save(feedback).getId();
  }

  private String requiredText(String value, int maxLength, String errorCode) {
    if (value == null || value.isBlank()) throw ApiException.badRequest(errorCode);
    String normalized = value.strip();
    if (normalized.length() > maxLength) throw ApiException.badRequest(errorCode);
    return normalized;
  }

  private String boundedOptional(String value, int maxLength, String errorCode) {
    if (value == null || value.isBlank()) return null;
    String normalized = value.strip();
    if (normalized.length() > maxLength) throw ApiException.badRequest(errorCode);
    return normalized;
  }

  private String firstPresent(String first, String second) {
    if (first != null && !first.isBlank()) return first;
    return second == null || second.isBlank() ? null : second;
  }

  private String toJson(List<String> imageUrls) {
    try {
      return objectMapper.writeValueAsString(imageUrls);
    } catch (JsonProcessingException e) {
      throw ApiException.internal("feedback_images_encode_failed");
    }
  }
}
