package com.runrace.backend.user;

import java.util.concurrent.ThreadLocalRandom;

public final class NicknameGenerator {

  private static final String[] ADJECTIVES = {
    "빠른", "느린", "신나는", "용감한", "귀여운", "씩씩한", "멋진", "활발한", "힘찬", "날쌘"
  };

  private static final String[] NOUNS = {
    "달리기왕", "토끼", "치타", "독수리", "호랑이", "곰", "여우", "늑대", "사슴", "말"
  };

  private NicknameGenerator() {}

  public static String generate() {
    ThreadLocalRandom rng = ThreadLocalRandom.current();
    String adj = ADJECTIVES[rng.nextInt(ADJECTIVES.length)];
    String noun = NOUNS[rng.nextInt(NOUNS.length)];
    int suffix = rng.nextInt(1000, 10000);
    return adj + noun + suffix;
  }
}
