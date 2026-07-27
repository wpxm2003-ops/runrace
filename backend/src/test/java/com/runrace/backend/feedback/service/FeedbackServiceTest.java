package com.runrace.backend.feedback.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.feedback.domain.Feedback;
import com.runrace.backend.feedback.dto.CreateFeedbackRequest;
import com.runrace.backend.feedback.repository.FeedbackRepository;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {
  @Mock FeedbackRepository feedbackRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock ImageUploadService imageUploadService;

  private FeedbackService service;
  private final UUID userId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    service = new FeedbackService(
        feedbackRepository, appUserRepository, imageUploadService, new ObjectMapper());
  }

  @Test
  void validFeedbackIsSaved() {
    String imageUrl = "https://bucket.example/uploads/image.jpg";
    AppUser user = AppUser.builder().id(userId).nickname("runner").build();
    when(imageUploadService.isStoredUrl(imageUrl)).thenReturn(true);
    when(appUserRepository.getRequired(userId)).thenReturn(user);
    when(feedbackRepository.save(any(Feedback.class))).thenAnswer(invocation -> invocation.getArgument(0));

    service.create(userId, request("BUG", "GPS issue", "The route jumped.", List.of(imageUrl)));

    verify(feedbackRepository).save(any(Feedback.class));
  }

  @Test
  void invalidTypeIsRejected() {
    ApiException exception = assertThrows(ApiException.class,
        () -> service.create(userId, request("UNKNOWN", "Title", "Content", List.of())));

    assertEquals("invalid_feedback_type", exception.code());
    verify(feedbackRepository, never()).save(any());
  }

  @Test
  void blankTitleIsRejected() {
    ApiException exception = assertThrows(ApiException.class,
        () -> service.create(userId, request("IDEA", "  ", "Content", List.of())));

    assertEquals("invalid_feedback_title", exception.code());
  }

  @Test
  void moreThanThreeImagesAreRejected() {
    ApiException exception = assertThrows(ApiException.class,
        () -> service.create(userId, request(
            "BUG", "Title", "Content", List.of("1", "2", "3", "4"))));

    assertEquals("invalid_feedback_images", exception.code());
    verify(imageUploadService, never()).isStoredUrl(any());
  }

  private CreateFeedbackRequest request(
      String type, String title, String content, List<String> imageUrls) {
    return new CreateFeedbackRequest(
        type, title, content, imageUrls, "https://runrace.co.kr/feedback",
        "test-agent", "test-version");
  }
}
