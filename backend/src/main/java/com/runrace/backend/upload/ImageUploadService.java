package com.runrace.backend.upload;

import com.runrace.backend.common.ApiException;
import java.io.IOException;
import java.util.Collection;
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
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
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
  /**
   * 비공개 객체(경품 이미지 등) 전용 버킷. app.aws.s3.private-bucket 미설정 시 공개 버킷으로 폴백한다.
   * 완전한 비공개를 보장하려면 이 값을 Block Public Access가 켜진 별도 버킷으로 지정한다.
   */
  private final String privateBucket;
  /** 이 서비스가 발급하는 URL 접두어 — 외부/타인 URL 주입·삭제를 거르는 데 사용. */
  private final String urlPrefix;

  public ImageUploadService(
      @Value("${app.aws.access-key}") String accessKey,
      @Value("${app.aws.secret-key}") String secretKey,
      @Value("${app.aws.region:ap-northeast-2}") String region,
      @Value("${app.aws.s3.bucket}") String bucket,
      @Value("${app.aws.s3.private-bucket:${app.aws.s3.bucket}}") String privateBucket) {
    this.bucket = bucket;
    this.privateBucket = privateBucket;
    this.urlPrefix = "https://" + bucket + ".s3." + region + ".amazonaws.com/";
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
    // Content-Type은 클라이언트 값을 믿지 않고 검증된 확장자에서 도출한다
    // (임의 text/html 등이 S3에서 그대로 서빙되는 것을 방지).
    String contentType = contentTypeForExtension(ext);

    try {
      s3.putObject(
          PutObjectRequest.builder()
              .bucket(bucket)
              .key(key)
              .contentType(contentType)
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
  /** 이 URL이 우리 S3 버킷에서 발급된 것인지. (외부/타인 URL 저장·삭제 차단용) */
  public boolean isStoredUrl(String url) {
    return url != null && url.startsWith(urlPrefix);
  }

  public void delete(String imageUrl) {
    if (imageUrl == null || imageUrl.isBlank()) return;
    // 우리 버킷 URL이 아니면 삭제하지 않는다 — 타인/외부 객체 삭제 방지(방어선).
    if (!isStoredUrl(imageUrl)) {
      log.warn("우리 버킷 URL이 아니어서 삭제 건너뜀: {}", imageUrl);
      return;
    }
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

  // ── 비공개 업로드(경품 이미지 등) — 공개 URL 미발급. 키만 보관하고 게이트 엔드포인트로만 서빙. ──
  /** 비공개 객체 prefix. 이 prefix의 키는 공개 URL로 노출하지 않는다. */
  private static final String PRIVATE_PREFIX = "prizes/";

  /** 비공개 업로드 — 전용(또는 폴백) 버킷에 private ACL로 저장하고 객체 키만 반환한다(URL 아님). */
  public String storePrivate(MultipartFile file) {
    String ext = resolveExtension(file.getOriginalFilename());
    String key = PRIVATE_PREFIX + UUID.randomUUID() + ext;
    try {
      // 객체 ACL은 설정하지 않는다 — ACL 비활성('Bucket owner enforced') 버킷에서는 .acl()이
      // AccessControlListNotSupported로 업로드를 깨뜨린다. 비공개가 필요하면 app.aws.s3.private-bucket을
      // Block Public Access 버킷으로 지정한다(그 버킷은 객체가 기본 비공개라 게이트만이 유일한 접근 경로).
      s3.putObject(
          PutObjectRequest.builder()
              .bucket(privateBucket)
              .key(key)
              .contentType(contentTypeForExtension(ext))
              .build(),
          RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
    } catch (IOException e) {
      log.error("S3 비공개 업로드 실패: key={}", key, e);
      throw ApiException.internal("upload_failed");
    }
    return key;
  }

  /** 이 서비스가 발급한 비공개 키 형식인지(외부/임의 키 주입 차단). */
  public boolean isPrivateKey(String key) {
    return key != null && key.startsWith(PRIVATE_PREFIX);
  }

  /** 비공개 객체 바이트 조회 — 권한 검사 후 스트리밍용. */
  public StoredImage loadPrivate(String key) {
    try {
      var bytes = s3.getObjectAsBytes(GetObjectRequest.builder().bucket(privateBucket).key(key).build());
      String contentType = bytes.response().contentType();
      return new StoredImage(bytes.asByteArray(), contentType != null ? contentType : "image/jpeg");
    } catch (Exception e) {
      log.warn("S3 비공개 객체 조회 실패: key={}", key, e);
      throw ApiException.notFound("image_not_found");
    }
  }

  /** 비공개 키로 객체 삭제(경품 교체/삭제 시). */
  public void deletePrivate(String key) {
    if (!isPrivateKey(key)) return;
    try {
      s3.deleteObject(DeleteObjectRequest.builder().bucket(privateBucket).key(key).build());
    } catch (Exception e) {
      log.warn("S3 비공개 객체 삭제 실패: key={}", key, e);
    }
  }

  /** 여러 공개 URL 정리(best-effort — 개별 실패는 {@link #delete}가 내부에서 로깅·삼킴). */
  public void deleteAll(Collection<String> urls) {
    if (urls != null) urls.forEach(this::delete);
  }

  /** 여러 비공개 키 정리(best-effort — 개별 실패는 {@link #deletePrivate}가 내부에서 로깅·삼킴). */
  public void deleteAllPrivate(Collection<String> keys) {
    if (keys != null) keys.forEach(this::deletePrivate);
  }

  /** 게이트 서빙용 이미지 바이트 + Content-Type. */
  public record StoredImage(byte[] bytes, String contentType) {}

  private String resolveExtension(String originalFilename) {
    if (originalFilename == null) return ".jpg";
    int dot = originalFilename.lastIndexOf('.');
    if (dot < 0) return ".jpg";
    String ext = originalFilename.substring(dot).toLowerCase();
    return ext.matches("\\.(jpg|jpeg|png|webp|gif)") ? ext : ".jpg";
  }

  /** 검증된 확장자 → 안전한 이미지 Content-Type. */
  private static String contentTypeForExtension(String ext) {
    return switch (ext) {
      case ".png" -> "image/png";
      case ".webp" -> "image/webp";
      case ".gif" -> "image/gif";
      default -> "image/jpeg";
    };
  }
}
