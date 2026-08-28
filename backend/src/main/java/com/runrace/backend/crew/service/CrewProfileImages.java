package com.runrace.backend.crew.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.upload.ImageUploadService;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 크루 프로필 이미지의 URL 검증과 JSON 표현을 한곳에서 관리한다. */
@Component
@RequiredArgsConstructor
class CrewProfileImages {
  private final ImageUploadService imageUploadService;
  private final ObjectMapper objectMapper;

  List<String> validate(List<String> rawImageUrls, String fallbackImageUrl, int maxImages) {
    List<String> rawList = rawImageUrls != null
        ? rawImageUrls
        : (fallbackImageUrl == null ? List.of() : List.of(fallbackImageUrl));
    List<String> urls = new ArrayList<>();
    for (String raw : rawList) {
      String url = validateUrl(raw);
      if (url == null || urls.contains(url)) continue;
      urls.add(url);
      if (urls.size() > maxImages) throw ApiException.badRequest("too_many_images");
    }
    return urls;
  }

  List<String> from(Crew crew, int maxImages) {
    String json = crew.getImageUrlsJson();
    if (json != null && !json.isBlank()) {
      try {
        List<String> parsed = objectMapper.readValue(
            json, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        return validate(parsed, crew.getImageUrl(), maxImages);
      } catch (JsonProcessingException e) {
        throw new IllegalStateException("crew_image_urls_decode_failed", e);
      }
    }
    String imageUrl = crew.getImageUrl();
    return imageUrl == null || imageUrl.isBlank() ? List.of() : List.of(imageUrl);
  }

  String toJson(List<String> imageUrls) {
    if (imageUrls == null || imageUrls.isEmpty()) return null;
    try {
      return objectMapper.writeValueAsString(imageUrls);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("crew_image_urls_encode_failed", e);
    }
  }

  private String validateUrl(String raw) {
    if (raw == null || raw.isBlank()) return null;
    String url = raw.trim();
    if (!imageUploadService.isStoredUrl(url)) throw ApiException.badRequest("invalid_image_url");
    return url;
  }
}
