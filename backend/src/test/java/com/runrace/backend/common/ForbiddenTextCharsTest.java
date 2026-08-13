package com.runrace.backend.common;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ForbiddenTextCharsTest {

  @Test void 일반_텍스트는_허용한다() {
    assertFalse(ForbiddenTextChars.containsForbidden("한강 러닝 크루! 매주 화·목 7시"));
    assertFalse(ForbiddenTextChars.containsForbidden("pace 5’30”와 같은 스마트따옴표는 허용"));
  }

  @Test void null은_금칙_아님() {
    assertFalse(ForbiddenTextChars.containsForbidden(null));
  }

  @Test void SQL_스크립트_취약_문자를_막는다() {
    assertTrue(ForbiddenTextChars.containsForbidden("따옴표\""));
    assertTrue(ForbiddenTextChars.containsForbidden("세미콜론;"));
    assertTrue(ForbiddenTextChars.containsForbidden("백틱`"));
    assertTrue(ForbiddenTextChars.containsForbidden("<script>"));
    assertTrue(ForbiddenTextChars.containsForbidden("역슬래시\\"));
  }

  @Test void C0_제어문자와_DEL을_막는다() {
    assertTrue(ForbiddenTextChars.containsForbidden("벨" + (char) 0x7 + "문자"));
    assertTrue(ForbiddenTextChars.containsForbidden("탭\t문자"));
    assertTrue(ForbiddenTextChars.containsForbidden("DEL" + (char) 0x7f + "문자"));
  }

  /** 프론트 forbiddenTextChars.ts(\p{Cc})와의 동기화 계약 — C1 제어문자(U+0080~U+009F)도 막는다. */
  @Test void C1_제어문자를_막는다() {
    assertTrue(ForbiddenTextChars.containsForbidden("NEL" + (char) 0x85 + "문자"));
    assertTrue(ForbiddenTextChars.containsForbidden("C1" + (char) 0x80 + "시작"));
    assertTrue(ForbiddenTextChars.containsForbidden("C1" + (char) 0x9f + "끝"));
  }
}
