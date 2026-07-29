package com.runrace.backend.upload;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;

/**
 * S3Client는 생성자 안에서 직접 만들어져(DI 아님) Mockito로 주입할 수 없다 —
 * ReflectionTestUtils로 실제 인스턴스를 목으로 바꿔치기한다.
 */
@ExtendWith(MockitoExtension.class)
class ImageUploadServiceTest {

  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock CrewRepository crewRepository;

  private final S3Client s3Client = mock(S3Client.class);
  private ImageUploadService service;

  private static final String BUCKET = "test-bucket";
  private static final String REGION = "ap-northeast-2";
  private static final String URL =
      "https://" + BUCKET + ".s3." + REGION + ".amazonaws.com/uploads/abc-123.jpg";

  @BeforeEach
  void setUp() {
    service = new ImageUploadService(
        "fake-access-key", "fake-secret-key", REGION, BUCKET, BUCKET,
        workoutSessionRepository, crewRepository);
    ReflectionTestUtils.setField(service, "s3", s3Client);
  }

  @Test void 다른_운동이_아직_참조중이면_S3에서_지우지_않는다() {
    when(workoutSessionRepository.existsByImageUrl(URL)).thenReturn(true);

    service.delete(URL);

    verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
  }

  @Test void 다른_크루가_아직_참조중이면_S3에서_지우지_않는다() {
    when(workoutSessionRepository.existsByImageUrl(URL)).thenReturn(false);
    when(crewRepository.existsByImageUrlsJsonContaining(URL)).thenReturn(true);

    service.delete(URL);

    verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
  }

  @Test void 아무데도_참조가_없으면_S3에서_실제로_지운다() {
    when(workoutSessionRepository.existsByImageUrl(URL)).thenReturn(false);
    when(crewRepository.existsByImageUrlsJsonContaining(URL)).thenReturn(false);

    service.delete(URL);

    ArgumentCaptor<DeleteObjectRequest> captor = ArgumentCaptor.forClass(DeleteObjectRequest.class);
    verify(s3Client).deleteObject(captor.capture());
    assertEquals(BUCKET, captor.getValue().bucket());
    assertEquals("uploads/abc-123.jpg", captor.getValue().key());
  }

  @Test void 우리_버킷_URL이_아니면_참조검사도_없이_건너뛴다() {
    service.delete("https://evil.example.com/steal.jpg");

    verifyNoInteractions(workoutSessionRepository, crewRepository, s3Client);
  }

  @Test void null이거나_빈문자열이면_아무_동작도_안한다() {
    service.delete(null);
    service.delete("");
    service.delete("   ");

    verifyNoInteractions(workoutSessionRepository, crewRepository, s3Client);
  }
}
