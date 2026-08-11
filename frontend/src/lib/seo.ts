import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/lib/i18n/translations";

/**
 * 공개 진입 페이지의 로케일별 메타데이터.
 *
 * 왜 이 방식인가: 프로덕션이 정적 내보내기(`output: "export"`)라 런타임 서버가 없다 —
 * 요청 헤더로 언어를 분기할 수 없고, 구글도 Accept-Language 협상을 권장하지 않는다
 * (한 버전만 색인될 수 있다). 정석대로 **언어별 URL을 빌드 타임에 굽고 hreflang으로 묶는다.**
 *
 * 대상은 로그인 없이 들어오는 페이지뿐이다. 앱 내부 화면은 SEO가 필요 없어 라우트를 늘리지 않는다.
 * 한국어는 접두사 없는 기존 경로(`/guides`)를 그대로 쓴다 — 현재 색인을 깨지 않기 위해서다.
 */
export type SeoPage = "home" | "guides" | "privacy" | "paceCalculator";

/** 접두사 없는 정식 경로. 한국어는 이 경로, 나머지는 `/{locale}` + 이 경로. */
const PATHS: Record<SeoPage, string> = {
  home: "",
  guides: "/guides",
  privacy: "/privacy",
  paceCalculator: "/tools/pace-calculator",
};

type Copy = { title: string; description: string };

const COPY: Record<Locale, Record<SeoPage, Copy>> = {
  ko: {
    home: {
      title: "RunRace — 친구와 함께하는 러닝 기록·대결 앱",
      description:
        "GPS로 러닝을 기록하고 페이스를 분석하고, 친구·크루와 거리 대결까지. 러닝이 게임이 되는 무료 러닝 앱 RunRace.",
    },
    guides: {
      title: "이용 가이드",
      description: "RunRace 앱 설치와 사용 방법 안내 — Android 앱, iOS 홈 화면 추가.",
    },
    privacy: {
      title: "개인정보처리방침",
      description: "RunRace 개인정보처리방침 — 수집 항목, 이용 목적, 보관 기간 안내.",
    },
    paceCalculator: {
      title: "러닝 페이스 계산기 — 5K·10K·하프·풀코스 목표 페이스",
      description:
        "목표 완주 시간을 페이스로, 페이스를 완주 시간으로 바로 변환하세요. 구간 통과 시간과 페이스별 완주 시간표까지 제공하는 무료 러닝 페이스 계산기.",
    },
  },
  en: {
    home: {
      title: "RunRace — Track your runs and race your friends",
      description:
        "Track runs with GPS, analyse your pace, and race friends and crews on distance. RunRace is a free running app that turns training into a game.",
    },
    guides: {
      title: "User guide",
      description: "How to install and use RunRace — Android app and adding it to your iOS home screen.",
    },
    privacy: {
      title: "Privacy policy",
      description: "RunRace privacy policy — what we collect, why we use it, and how long we keep it.",
    },
    paceCalculator: {
      title: "Running pace calculator — 5K, 10K, half and full marathon",
      description:
        "Convert a target finish time into a pace, or a pace into a finish time. Free running pace calculator with split times and a pace chart.",
    },
  },
  es: {
    home: {
      title: "RunRace — Registra tus carreras y compite con amigos",
      description:
        "Registra carreras con GPS, analiza tu ritmo y compite en distancia con amigos y equipos. RunRace es una app de running gratuita que convierte el entrenamiento en un juego.",
    },
    guides: {
      title: "Guía de uso",
      description: "Cómo instalar y usar RunRace — app de Android y cómo añadirla a la pantalla de inicio en iOS.",
    },
    privacy: {
      title: "Política de privacidad",
      description: "Política de privacidad de RunRace — qué datos recogemos, para qué los usamos y cuánto tiempo los conservamos.",
    },
    paceCalculator: {
      title: "Calculadora de ritmo de carrera — 5K, 10K, media y maratón",
      description:
        "Convierte un tiempo objetivo en ritmo, o un ritmo en tiempo de meta. Calculadora de ritmo gratuita con tiempos parciales y tabla de ritmos.",
    },
  },
  ja: {
    home: {
      title: "RunRace — ランを記録して友達と競うアプリ",
      description:
        "GPSでランを記録し、ペースを分析し、友達やクルーと距離で競争。トレーニングがゲームになる無料ランニングアプリ、RunRace。",
    },
    guides: {
      title: "利用ガイド",
      description: "RunRaceのインストールと使い方 — Androidアプリ、iOSのホーム画面への追加方法。",
    },
    privacy: {
      title: "プライバシーポリシー",
      description: "RunRaceのプライバシーポリシー — 収集する情報、利用目的、保管期間のご案内。",
    },
    paceCalculator: {
      title: "ランニングペース計算機 — 5K・10K・ハーフ・フルマラソン",
      description:
        "目標タイムからペースへ、ペースから完走タイムへ即座に変換。スプリットタイムとペース早見表つきの無料ペース計算機。",
    },
  },
  zh: {
    home: {
      title: "RunRace — 记录跑步，与好友比拼",
      description:
        "用 GPS 记录跑步、分析配速，还能和好友与跑团比拼距离。RunRace 是一款让训练变成游戏的免费跑步应用。",
    },
    guides: {
      title: "使用指南",
      description: "RunRace 的安装与使用方法 — Android 应用，以及添加到 iOS 主屏幕。",
    },
    privacy: {
      title: "隐私政策",
      description: "RunRace 隐私政策 — 收集哪些信息、用途以及保存期限。",
    },
    paceCalculator: {
      title: "跑步配速计算器 — 5公里、10公里、半马与全马",
      description:
        "把目标完赛时间换算成配速，或把配速换算成完赛时间。免费配速计算器，附分段时间与配速对照表。",
    },
  },
};

/** 접두사 없는 경로가 한국어. 나머지는 `/{locale}` 접두사. */
export function localizedPath(page: SeoPage, locale: Locale): string {
  const path = PATHS[page];
  if (locale === "ko") return path === "" ? "/" : path;
  return `/${locale}${path}`;
}

/** hreflang 맵 — 같은 페이지의 모든 언어 버전을 서로 묶어 준다. */
function languageAlternates(page: SeoPage): Record<string, string> {
  return Object.fromEntries(
    LOCALES.map(({ code }) => [code, localizedPath(page, code)]),
  );
}

/** 제목 문자열만 필요할 때(루트 layout의 title.template 기본값 등). */
export function pageTitle(page: SeoPage, locale: Locale): string {
  return COPY[locale][page].title;
}

/** 공개 페이지의 로케일별 Metadata. 한국어 페이지·언어별 페이지가 함께 쓴다. */
export function pageMetadata(page: SeoPage, locale: Locale): Metadata {
  const { title, description } = COPY[locale][page];
  const url = localizedPath(page, locale);
  return {
    // 홈 타이틀엔 이미 "RunRace"가 들어 있어, 루트의 "%s | RunRace" 템플릿이 붙으면 중복된다.
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(page) },
    openGraph: {
      title,
      description,
      url,
      siteName: "RunRace",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

/** Metadata for a concrete child route that should not inherit its parent's canonical URL. */
export function pageMetadataAtPath(
  page: SeoPage,
  locale: Locale,
  path: string,
): Metadata {
  const { title, description } = COPY[locale][page];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "RunRace",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

/** 접두사 URL을 갖는 언어들(`app/en`, `app/ja` …). 한국어는 접두사 없는 기존 경로가 담당한다. */
export const PREFIXED_LOCALES: Locale[] = LOCALES.map((l) => l.code).filter(
  (code) => code !== "ko",
);
