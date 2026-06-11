package com.runrace.backend.share;

import com.runrace.backend.challenge.Challenge;
import com.runrace.backend.challenge.ChallengeService;
import com.runrace.backend.common.ApiException;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/**
 * 카카오톡 등 링크 미리보기용 HTML.
 * 정적 export된 /challenges/{id} 페이지는 빌드 시점 OG가 박히므로,
 * 공유 URL은 이 엔드포인트를 쓰면 항상 최신 레이스 정보가 미리보기에 반영된다.
 */
@RestController
@RequestMapping("/api/share")
@RequiredArgsConstructor
public class SharePageController {

  private final ChallengeService challengeService;

  @Value("${runrace.app-url:https://runrace.co.kr}")
  private String appUrl;

  @GetMapping(value = "/challenges/{id:[0-9]+}", produces = MediaType.TEXT_HTML_VALUE)
  public ResponseEntity<String> challengeShare(@PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail;
    try {
      detail = challengeService.getDetail(Optional.empty(), id);
    } catch (ApiException e) {
      if ("challenge_not_found".equals(e.code())) {
        return ResponseEntity.notFound().build();
      }
      throw e;
    }

    Challenge challenge = detail.challenge();
    String title = escape(challenge.getTitle()) + " | RunRace";
    String description =
        "🏃 " + challenge.getGoalKm().stripTrailingZeros().toPlainString()
            + "km · 👥 " + detail.memberCount() + "명";
    String pageUrl = appUrl + "/challenges/" + id;
    String ogImage = appUrl + "/og-image.png";

    String html =
        """
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8"/>
          <title>%s</title>
          <meta name="description" content="%s"/>
          <meta property="og:title" content="%s"/>
          <meta property="og:description" content="%s"/>
          <meta property="og:url" content="%s"/>
          <meta property="og:site_name" content="RunRace"/>
          <meta property="og:image" content="%s"/>
          <meta property="og:image:width" content="1200"/>
          <meta property="og:image:height" content="630"/>
          <meta property="og:type" content="website"/>
          <meta name="twitter:card" content="summary_large_image"/>
          <meta http-equiv="refresh" content="0;url=%s"/>
        </head>
        <body>
          <p><a href="%s">RunRace 레이스로 이동</a></p>
        </body>
        </html>
        """
            .formatted(title, description, title, description, pageUrl, ogImage, pageUrl, pageUrl);

    return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html);
  }

  private static String escape(String raw) {
    return HtmlUtils.htmlEscape(raw == null ? "" : raw);
  }
}
