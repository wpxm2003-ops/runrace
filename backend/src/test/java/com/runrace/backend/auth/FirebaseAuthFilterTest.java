package com.runrace.backend.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.runrace.backend.auth.service.FirebaseUserService;
import com.runrace.backend.observability.service.ErrorLogService;
import jakarta.servlet.FilterChain;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 인증 필터 단위 테스트.
 *
 * <p>이 필터는 248줄/분기 30개인데 테스트가 하나도 없었고, 저장소 전체에 MockMvc·
 * SpringBootTest도 없어 어떤 테스트도 이 코드를 태우지 않았다. 여기서 지키려는 것은
 * 무엇보다 <b>인증을 건너뛰는 경로 목록이 의도보다 넓어지지 않는다</b>는 것이다 —
 * 정규식 하나가 느슨해지면 조용히 인증이 뚫린다.
 *
 * <p>필터는 `FirebaseApp.getApps()`가 비어 있으면 토큰을 보기도 전에 401을 낸다.
 * 그래서 토큰 분기를 태우려면 앱이 하나는 등록돼 있어야 한다 — {@link #withFirebaseApp}가
 * 네트워크 없이 가짜 자격증명으로 이름 있는 앱을 잠깐 띄우고 반드시 지운다(전역 상태라
 * 다른 테스트로 새면 안 된다). `FirebaseAuth.getInstance()` 폴백은 기본 앱이 필요해
 * 커버하지 않는다 — 그 경로는 예외로 떨어져 auth_failed가 되는 것까지만 확인한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FirebaseAuthFilterTest {

  private static final AtomicInteger APP_SEQ = new AtomicInteger();

  @Mock FirebaseUserService firebaseUserService;
  @Mock JwtService jwtService;
  @Mock ErrorLogService errorLogService;
  @Mock FilterChain chain;

  private FirebaseAuthFilter filter() {
    return new FirebaseAuthFilter(firebaseUserService, jwtService, errorLogService);
  }

  private static MockHttpServletRequest request(String method, String path) {
    MockHttpServletRequest req = new MockHttpServletRequest(method, path);
    req.setRequestURI(path);
    return req;
  }

  private static MockHttpServletRequest bearer(String method, String path, String token) {
    MockHttpServletRequest req = request(method, path);
    req.addHeader("Authorization", token);
    return req;
  }

  private boolean skipsAuth(String method, String path) {
    return filter().shouldNotFilter(request(method, path));
  }

  interface Body {
    void run() throws Exception;
  }

  /** 네트워크 없이 FirebaseApp을 하나 띄운 상태로 실행하고, 끝나면 반드시 지운다. */
  private static void withFirebaseApp(Body body) throws Exception {
    FirebaseApp app = FirebaseApp.initializeApp(
        FirebaseOptions.builder()
            .setCredentials(GoogleCredentials.create(
                new AccessToken("fake-token", new Date(System.currentTimeMillis() + 3_600_000))))
            .setProjectId("runrace-test")
            .build(),
        "filter-test-" + APP_SEQ.incrementAndGet());
    try {
      body.run();
    } finally {
      app.delete();
    }
  }

  @AfterEach
  void clearContext() {
    AuthContext.clear();
  }

  /**
   * 인증을 아예 건너뛰는 경로. 여기에 새 경로가 붙는 것은 곧 공개 API가 하나 늘어난다는
   * 뜻이므로, 열려야 할 것만 열리는지 양방향으로 확인한다.
   */
  @Nested
  class SkipsAuthEntirely {

    @Test
    void preflightAndNonApiPaths() {
      assertTrue(skipsAuth("OPTIONS", "/api/workouts"));
      assertTrue(skipsAuth("GET", "/health"));
      assertTrue(skipsAuth("GET", "/"));
      assertTrue(skipsAuth("GET", "/api/public/anything"));
    }

    @Test
    void kakaoLoginIsPublicOnPostOnly() {
      assertTrue(skipsAuth("POST", "/api/auth/kakao"));
      // 같은 경로라도 다른 메서드는 인증을 태워야 한다.
      assertFalse(skipsAuth("GET", "/api/auth/kakao"));
    }

    @Test
    void shareRoutesAreOpenOnGetOnly() {
      assertTrue(skipsAuth("GET", "/api/workouts/12/share"));
      assertTrue(skipsAuth("GET", "/api/training-plan/report/7"));
      assertTrue(skipsAuth("GET", "/api/share/challenges/3"));

      assertFalse(skipsAuth("POST", "/api/workouts/12/share"));
      assertFalse(skipsAuth("DELETE", "/api/workouts/12/share"));
    }

    /** 공유 경로의 ID는 숫자만이다 — 느슨해지면 하위 경로가 통째로 열린다. */
    @Test
    void shareRoutesRejectNonNumericAndTrailingSegments() {
      assertFalse(skipsAuth("GET", "/api/workouts/abc/share"));
      assertFalse(skipsAuth("GET", "/api/workouts/12/shareX"));
      assertFalse(skipsAuth("GET", "/api/workouts/12/share/secret"));
      assertFalse(skipsAuth("GET", "/api/workouts/12"));
      assertFalse(skipsAuth("GET", "/api/share/challenges/3/members"));
    }

    /** 접두사 매칭이라 경계에 붙는 다른 이름까지 열리면 안 된다. */
    @Test
    void uploadServingIsOpenByPrefixButNotByName() {
      assertTrue(skipsAuth("GET", "/api/uploads/a/b.png"));
      assertFalse(skipsAuth("GET", "/api/uploadsX/a.png"));
      assertFalse(skipsAuth("POST", "/api/uploads/a/b.png"));
    }

    /**
     * 경로 정규화는 서블릿 컨테이너 몫이다 — Tomcat이 `..`를 정규화·거부한 뒤에야 필터가
     * 돈다. 따라서 필터는 정규화된 경로만 본다는 전제로 판정하고, 그 결과가 보호되는지만
     * 확인한다(`/api/public/../admin` → `/api/admin`).
     */
    @Test
    void normalizedTraversalTargetsStayProtected() {
      assertFalse(skipsAuth("GET", "/api/admin/dashboard"));
      assertFalse(skipsAuth("GET", "/api/workouts/12"));
    }

    @Test
    void protectedRoutesStayProtected() {
      assertFalse(skipsAuth("GET", "/api/workouts"));
      assertFalse(skipsAuth("GET", "/api/admin/dashboard"));
      assertFalse(skipsAuth("POST", "/api/workouts/start"));
    }
  }

  /**
   * 토큰이 있으면 인증하되 없어도 통과시키는 경로. 인증 실패가 401이 되면 비회원이
   * 공개 화면을 못 보게 되므로, 체인이 계속 도는지가 핵심이다.
   */
  @Nested
  class OptionalAuthEndpoints {

    @Test
    void publicReadsPassThroughWithoutToken() throws Exception {
      for (String path : new String[] {
          "/api/challenges",
          "/api/challenges/5",
          "/api/challenges/5/workouts",
          "/api/challenges/5/prizes",
          "/api/crews/discover",
          "/api/crews/9",
      }) {
        FilterChain localChain = org.mockito.Mockito.mock(FilterChain.class);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilterInternal(request("GET", path), res, localChain);

        assertEquals(200, res.getStatus(), path + " 은 비회원도 통과해야 한다");
        verify(localChain).doFilter(any(), any());
      }
    }

    @Test
    void clientErrorReportAcceptsAnonymousPost() throws Exception {
      MockHttpServletResponse res = new MockHttpServletResponse();
      filter().doFilterInternal(request("POST", "/api/client-errors"), res, chain);

      assertEquals(200, res.getStatus());
      verify(chain).doFilter(any(), any());
    }

    /** 잘못된 토큰이 붙어도 공개 조회는 막히지 않아야 한다(조용히 익명 처리). */
    @Test
    void invalidTokenStillPassesThrough() throws Exception {
      withFirebaseApp(() -> {
        when(jwtService.verify(anyString())).thenThrow(new RuntimeException("broken"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter().doFilterInternal(
            bearer("GET", "/api/challenges/5", "Bearer garbage"), res, chain);

        assertEquals(200, res.getStatus());
        verify(chain).doFilter(any(), any());
      });
    }

    /** 공개 조회라도 유효한 자체 JWT면 인증이 붙어야 한다(로그인 사용자용 필드 때문). */
    @Test
    void validJwtAuthenticatesOnPublicRead() throws Exception {
      withFirebaseApp(() -> {
        AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), "uid-1");
        when(jwtService.verify("good")).thenReturn(Optional.of(principal));
        FilterChain capturing = (req, res) ->
            assertEquals(
                Optional.of(principal),
                AuthContext.getOptional(),
                "체인이 도는 동안에는 인증이 붙어 있어야 한다");

        filter().doFilterInternal(
            bearer("GET", "/api/challenges/5", "Bearer good"),
            new MockHttpServletResponse(),
            capturing);
      });
    }

    /** 목록은 열려 있어도 쓰기는 인증을 태워야 한다. */
    @Test
    void writesToTheSamePathsAreNotOptional() throws Exception {
      MockHttpServletResponse res = new MockHttpServletResponse();
      filter().doFilterInternal(request("POST", "/api/challenges"), res, chain);

      assertEquals(401, res.getStatus());
      verify(chain, never()).doFilter(any(), any());
    }
  }

  @Nested
  class RequiredAuth {

    @Test
    void missingTokenIsRejected() throws Exception {
      withFirebaseApp(() -> {
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilterInternal(request("GET", "/api/workouts"), res, chain);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("missing_bearer_token"));
        verify(chain, never()).doFilter(any(), any());
      });
    }

    /** Bearer 파싱의 경계 — 접두사가 없거나 값이 비면 "토큰 없음"으로 처리돼야 한다. */
    @Test
    void malformedAuthorizationHeadersCountAsMissing() throws Exception {
      withFirebaseApp(() -> {
        for (String header : new String[] {"", "Basic abc", "bearer lower", "Bearer ", "Bearer    "}) {
          MockHttpServletResponse res = new MockHttpServletResponse();

          filter().doFilterInternal(bearer("GET", "/api/workouts", header), res, chain);

          assertEquals(401, res.getStatus(), "헤더 [" + header + "] 는 미인증이어야 한다");
          assertTrue(
              res.getContentAsString().contains("missing_bearer_token"),
              "헤더 [" + header + "] 는 missing_bearer_token 이어야 한다");
        }
      });
    }

    /** 유효한 자체 JWT는 Firebase 네트워크 호출 없이 통과한다. */
    @Test
    void validJwtPassesWithoutFirebaseLookup() throws Exception {
      withFirebaseApp(() -> {
        AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), "uid-1");
        when(jwtService.verify("good")).thenReturn(Optional.of(principal));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter().doFilterInternal(bearer("GET", "/api/workouts", "Bearer good"), res, chain);

        assertEquals(200, res.getStatus());
        verify(chain).doFilter(any(), any());
        verify(firebaseUserService, never()).upsertAndCreatePrincipal(any(), anyString());
      });
    }

    /**
     * 자체 JWT가 아니면 Firebase 폴백으로 넘어간다. 테스트에는 기본 앱이 없어 그 안에서
     * 예외가 나는데, <b>통과가 아니라 401로 떨어져야</b> 한다 — 여기서 조용히 통과하면
     * 보호 구간이 인증 없이 열린다.
     */
    @Test
    void firebaseFallbackFailureIsRejectedNotBypassed() throws Exception {
      withFirebaseApp(() -> {
        when(jwtService.verify(anyString())).thenReturn(Optional.empty());
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter().doFilterInternal(
            bearer("GET", "/api/workouts", "Bearer firebase-token"), res, chain);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("auth_failed"));
        verify(chain, never()).doFilter(any(), any());
      });
    }

    /**
     * 자체 JWT는 로컬 HMAC 검증만으로 끝나므로 Firebase Admin이 없어도 통과해야 한다.
     * 예전에는 진입부에서 초기화 여부를 먼저 봐서, Admin 실패 하나로 기존 로그인 사용자까지
     * 전부 401이 됐다.
     */
    @Test
    void validJwtWorksWithoutFirebaseAdmin() throws Exception {
      AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), "uid-1");
      when(jwtService.verify("good")).thenReturn(Optional.of(principal));
      MockHttpServletResponse res = new MockHttpServletResponse();

      filter().doFilterInternal(bearer("GET", "/api/workouts", "Bearer good"), res, chain);

      assertEquals(200, res.getStatus());
      verify(chain).doFilter(any(), any());
    }

    /**
     * 자체 JWT가 아니면 Firebase 폴백이 필요한데 Admin이 없다 — 통과가 아니라 401이어야
     * 한다(fail-closed). 이 순서가 뒤집히면 인증 없이 보호 구간이 열린다.
     */
    @Test
    void uninitializedFirebaseRejectsNonJwtToken() throws Exception {
      when(jwtService.verify(anyString())).thenReturn(Optional.empty());
      MockHttpServletResponse res = new MockHttpServletResponse();

      filter().doFilterInternal(
          bearer("GET", "/api/workouts", "Bearer firebase-token"), res, chain);

      assertEquals(401, res.getStatus());
      assertTrue(res.getContentAsString().contains("firebase_admin_not_initialized"));
      verify(chain, never()).doFilter(any(), any());
    }

    /** 토큰 자체가 없으면 Firebase 초기화 여부와 무관하게 missing_bearer_token 이다. */
    @Test
    void missingTokenReportsMissingTokenEvenWithoutFirebase() throws Exception {
      MockHttpServletResponse res = new MockHttpServletResponse();

      filter().doFilterInternal(request("GET", "/api/workouts"), res, chain);

      assertEquals(401, res.getStatus());
      assertTrue(res.getContentAsString().contains("missing_bearer_token"));
    }

    @Test
    void unauthorizedBodyIsJson() throws Exception {
      withFirebaseApp(() -> {
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter().doFilterInternal(request("GET", "/api/workouts"), res, chain);

        assertEquals("application/json", res.getContentType());
        assertEquals(
            "{\"error\":\"unauthorized\",\"code\":\"missing_bearer_token\"}",
            res.getContentAsString());
      });
    }
  }

  /**
   * AuthContext는 ThreadLocal이다. 요청이 끝나며 비우지 않으면 스레드를 재사용하는 다음
   * 요청이 앞 사용자의 인증을 물려받는다 — 계정 간 데이터 유출로 직결된다.
   */
  @Nested
  class ContextCleanup {

    @Test
    void clearedAfterSuccessfulRequest() throws Exception {
      withFirebaseApp(() -> {
        when(jwtService.verify("good"))
            .thenReturn(Optional.of(new AuthPrincipal(UUID.randomUUID(), "uid-1")));

        filter().doFilterInternal(
            bearer("GET", "/api/workouts", "Bearer good"), new MockHttpServletResponse(), chain);

        assertTrue(AuthContext.getOptional().isEmpty());
      });
    }

    @Test
    void clearedAfterRejectedRequest() throws Exception {
      AuthContext.set(new AuthPrincipal(UUID.randomUUID(), "stale"));

      filter().doFilterInternal(
          request("GET", "/api/workouts"), new MockHttpServletResponse(), chain);

      assertTrue(AuthContext.getOptional().isEmpty());
    }

    /** 체인이 던져도 비워야 한다. */
    @Test
    void clearedWhenChainThrows() throws Exception {
      withFirebaseApp(() -> {
        when(jwtService.verify("good"))
            .thenReturn(Optional.of(new AuthPrincipal(UUID.randomUUID(), "uid-1")));
        org.mockito.Mockito.doThrow(new RuntimeException("downstream"))
            .when(chain).doFilter(any(), any());

        filter().doFilterInternal(
            bearer("GET", "/api/workouts", "Bearer good"), new MockHttpServletResponse(), chain);

        assertTrue(AuthContext.getOptional().isEmpty());
      });
    }
  }
}
