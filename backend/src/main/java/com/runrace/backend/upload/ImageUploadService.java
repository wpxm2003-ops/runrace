package com.runrace.backend.upload;

import com.runrace.backend.common.ApiException;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetUrlRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * 이미지 파일을 S3에 저장한다.
 */
@Service
public class ImageUploadService {

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
      throw new IllegalStateException("S3 업로드 실패", e);
    }

    // https://<bucket>.s3.<region>.amazonaws.com/<key>
    return s3.utilities()
        .getUrl(GetUrlRequest.builder().bucket(bucket).key(key).build())
        .toString();
  }

  private String resolveExtension(String originalFilename) {
    if (originalFilename == null) return ".jpg";
    int dot = originalFilename.lastIndexOf('.');
    if (dot < 0) return ".jpg";
    String ext = originalFilename.substring(dot).toLowerCase();
    return ext.matches("\\.(jpg|jpeg|png|webp|gif)") ? ext : ".jpg";
  }
}
