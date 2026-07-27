package com.runrace.backend.feedback.dto;

import java.util.List;

public record CreateFeedbackRequest(
    String type,
    String title,
    String content,
    List<String> imageUrls,
    String pageUrl,
    String userAgent,
    String appVersion) {}
