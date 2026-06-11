package com.runrace.backend.user;

import java.util.concurrent.ThreadLocalRandom;

/**
 * 가입 시점의 사용자 언어로 닉네임을 조합 생성한다(A풀 + B풀 + 숫자).
 * 대부분 언어는 형용사+명사 순, 스페인어만 명사+형용사 순으로 풀을 배치했다.
 */
public final class NicknameGenerator {

  // 한국어: 형용사 + 명사
  private static final String[] KO_A = {
    "빠른", "느린", "신나는", "용감한", "귀여운", "씩씩한", "멋진", "활발한", "힘찬", "날쌘"
  };
  private static final String[] KO_B = {
    "달리기왕", "토끼", "치타", "독수리", "호랑이", "곰", "여우", "늑대", "사슴", "말"
  };

  // English: adjective + noun
  private static final String[] EN_A = {
    "Fast", "Swift", "Brave", "Mighty", "Lucky", "Sunny", "Bold", "Wild", "Calm", "Eager"
  };
  private static final String[] EN_B = {
    "Runner", "Rabbit", "Cheetah", "Eagle", "Tiger", "Bear", "Fox", "Wolf", "Deer", "Horse"
  };

  // Español: sustantivo + adjetivo (orden natural)
  private static final String[] ES_A = {
    "Conejo", "Guepardo", "Aguila", "Tigre", "Oso", "Zorro", "Lobo", "Ciervo", "Caballo", "Corredor"
  };
  private static final String[] ES_B = {
    "Veloz", "Rapido", "Valiente", "Fuerte", "Agil", "Audaz", "Feroz", "Vivaz", "Bravo", "Ligero"
  };

  // 日本語: 形容詞 + 名詞
  private static final String[] JA_A = {
    "速い", "俊敏な", "勇敢な", "元気な", "可愛い", "力強い", "素早い", "活発な", "軽快な", "大胆な"
  };
  private static final String[] JA_B = {
    "ランナー", "ウサギ", "チーター", "ワシ", "トラ", "クマ", "キツネ", "オオカミ", "シカ", "ウマ"
  };

  // 简体中文: 形容词 + 名词
  private static final String[] ZH_A = {
    "迅捷", "快速", "勇敢", "强壮", "敏捷", "大胆", "凶猛", "活泼", "轻快", "飞快"
  };
  private static final String[] ZH_B = {
    "跑者", "兔子", "猎豹", "雄鹰", "老虎", "熊", "狐狸", "狼", "鹿", "马"
  };

  private NicknameGenerator() {}

  public static String generate() {
    return generate("ko");
  }

  public static String generate(String lang) {
    String[] a;
    String[] b;
    switch (lang == null ? "ko" : lang) {
      case "en" -> {
        a = EN_A;
        b = EN_B;
      }
      case "es" -> {
        a = ES_A;
        b = ES_B;
      }
      case "ja" -> {
        a = JA_A;
        b = JA_B;
      }
      case "zh" -> {
        a = ZH_A;
        b = ZH_B;
      }
      default -> {
        a = KO_A;
        b = KO_B;
      }
    }
    ThreadLocalRandom rng = ThreadLocalRandom.current();
    // 5자리 숫자(10000~99999) — 언어당 조합 공간 약 900만으로 충돌 여유 확보
    return a[rng.nextInt(a.length)] + b[rng.nextInt(b.length)] + rng.nextInt(10000, 100000);
  }
}
