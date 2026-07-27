package com.runrace.backend.feedback.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.feedback.dto.CreateFeedbackRequest;
import com.runrace.backend.feedback.service.FeedbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/feedback")
@RequiredArgsConstructor
public class FeedbackController {
  private final FeedbackService feedbackService;

  @PostMapping
  public ResponseEntity<CreateFeedbackResponse> create(
      AuthPrincipal principal,
      @RequestBody CreateFeedbackRequest request) {
    return ResponseEntity.ok(
        new CreateFeedbackResponse(feedbackService.create(principal.userId(), request)));
  }

  public record CreateFeedbackResponse(Long id) {}
}
