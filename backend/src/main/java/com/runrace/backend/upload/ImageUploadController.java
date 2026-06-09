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

  public record ImageUploadResponse(String url) {}
}
