package com.runrace.backend.upload;

import com.runrace.backend.common.ApiException;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetUrlRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * 이미지 파일을 S3에 저장한다.
 */
@Service
public class ImageUploadService {
  private static final Logger log = LoggerFactory.getLogger(ImageUploadService.class);

  private final S3Client s3;
  private final String bucket;

  public ImageUploadService(
      @Value("${app.aws.access-key}") String accessKey,
      @Value("${app.aws.secret-key}") String secretKey,
      @Value("${app.aws.region:ap-northeast-2}") String region,
      @Value("${app.aws.s3.bucket}") String bucket) {
    this.bucket = bucket;
    this.s3 = S3Client.builder()
        .region(Region.of(region))
        .credentialsProvider(StaticCredentialsProvider.create(
            AwsBasicCredentials.create(accessKey, secretKey)))
        .build();
  }

  /** 파일을 S3에 업로드하고 접근 URL을 반환한다. */
  public String store(MultipartFile file) {
    String ext = resolveExtension(file.getOriginalFilename());
    String key = "uploads/" + UUID.randomUUID() + ext;

    try {
      s3.putObject(
          PutObjectRequest.builder()
              .bucket(bucket)
              .key(key)
              .contentType(file.getContentType() != null ? file.getContentType() : "image/jpeg")
              .build(),
          RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
    } catch (IOException e) {
      // 인프라 실패 — 안정적인 에러 코드로 전달하되 운영 추적을 위해 로깅한다.
      log.error("S3 업로드 실패: key={}", key, e);
      throw ApiException.internal("upload_failed");
    }

    // https://<bucket>.s3.<region>.amazonaws.com/<key>
    return s3.utilities()
        .getUrl(GetUrlRequest.builder().bucket(bucket).key(key).build())
        .toString();
  }

  /**
   * S3 URL에서 key를 추출해 해당 객체를 삭제한다.
   * URL이 null이거나 파싱 실패 시 조용히 무시한다.
   */
  public void delete(String imageUrl) {
    if (imageUrl == null || imageUrl.isBlank()) return;
    try {
      // https://<bucket>.s3.<region>.amazonaws.com/<key>
      java.net.URI uri = java.net.URI.create(imageUrl);
      String key = uri.getPath().replaceFirst("^/", "");
      s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    } catch (Exception e) {
      // 삭제 실패해도 운동 기록 삭제는 계속 진행
      log.warn("S3 이미지 삭제 실패: {}", imageUrl, e);
    }
  }

  private String resolveExtension(String originalFilename) {
    if (originalFilename == null) return ".jpg";
    int dot = originalFilename.lastIndexOf('.');
    if (dot < 0) return ".jpg";
    String ext = originalFilename.substring(dot).toLowerCase();
    return ext.matches("\\.(jpg|jpeg|png|webp|gif)") ? ext : ".jpg";
  }
}
