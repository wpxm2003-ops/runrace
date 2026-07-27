package com.runrace.backend.upload;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/uploads")
public class ImageUploadController {

  private final ImageUploadService imageUploadService;

  public ImageUploadController(ImageUploadService imageUploadService) {
    this.imageUploadService = imageUploadService;
  }

  /** 이미지 업로드 (인증 필요). 반환: { "url": "https://...s3...amazonaws.com/uploads/xxx.jpg" } */
  @PostMapping("/image")
  public ResponseEntity<ImageUploadResponse> upload(
      AuthPrincipal principal,
      @RequestParam("file") MultipartFile file) {
    if (file.isEmpty()) {
      throw ApiException.badRequest("file_empty");
    }
    String url = imageUploadService.store(file);
    return ResponseEntity.ok(new ImageUploadResponse(url));
  }

  @PostMapping("/feedback-image")
  public ResponseEntity<ImageUploadResponse> uploadFeedbackImage(
      AuthPrincipal principal,
      @RequestParam("file") MultipartFile file) {
    if (file.isEmpty()) {
      throw ApiException.badRequest("file_empty");
    }
    if (file.getSize() > 5L * 1024 * 1024) {
      throw ApiException.badRequest("upload_too_large");
    }
    String contentType = file.getContentType();
    if (contentType == null || !java.util.Set.of(
        "image/jpeg", "image/png", "image/webp").contains(contentType.toLowerCase())) {
      throw ApiException.badRequest("upload_invalid_type");
    }
    String filename = file.getOriginalFilename();
    if (filename == null
        || !filename.toLowerCase().matches(".*\\.(jpg|jpeg|png|webp)$")) {
      throw ApiException.badRequest("upload_invalid_type");
    }
    return ResponseEntity.ok(new ImageUploadResponse(imageUploadService.store(file)));
  }

  /**
   * 비공개 이미지 업로드 (인증 필요) — 경품 이미지 등. 공개 URL이 아니라 객체 키만 반환한다.
   * 반환: { "key": "prizes/xxx.jpg" } — 이후 게이트 엔드포인트로만 열람 가능.
   */
  @PostMapping("/private-image")
  public ResponseEntity<PrivateImageResponse> uploadPrivate(
      AuthPrincipal principal,
      @RequestParam("file") MultipartFile file) {
    if (file.isEmpty()) {
      throw ApiException.badRequest("file_empty");
    }
    String key = imageUploadService.storePrivate(file);
    return ResponseEntity.ok(new PrivateImageResponse(key));
  }

  public record ImageUploadResponse(String url) {}

  public record PrivateImageResponse(String key) {}
}
