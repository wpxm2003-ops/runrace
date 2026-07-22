import type { useLocale } from "@/lib/i18n";

/**
 * 시도 지역 코드 — 발견 필터 칩·프로필 선택기에 이 순서 그대로 노출한다.
 * 경기도만 예외로 남/북 2분할(인구 1위 + 한강 기준 생활권 분리) — 나머지는 시도 레벨 유지.
 */
export const CREW_REGIONS = [
  "SEOUL", "BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN", "SEJONG",
  "GYEONGGI_SOUTH", "GYEONGGI_NORTH", "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM",
  "GYEONGBUK", "GYEONGNAM", "JEJU", "ONLINE", "ETC",
] as const;

export const CREW_DISCOVERY_FEATURED_REGIONS = [
  "SEOUL",
  "GYEONGGI_SOUTH",
  "GYEONGGI_NORTH",
  "INCHEON",
  "BUSAN",
] as const;

export type CrewRegionCode = (typeof CREW_REGIONS)[number];

/** 지역 코드 → 로케일별 표시명. */
export function crewRegionLabel(region: string, t: ReturnType<typeof useLocale>["t"]): string {
  switch (region) {
    case "SEOUL": return t.crew_region_seoul;
    case "BUSAN": return t.crew_region_busan;
    case "DAEGU": return t.crew_region_daegu;
    case "INCHEON": return t.crew_region_incheon;
    case "GWANGJU": return t.crew_region_gwangju;
    case "DAEJEON": return t.crew_region_daejeon;
    case "ULSAN": return t.crew_region_ulsan;
    case "SEJONG": return t.crew_region_sejong;
    case "GYEONGGI_SOUTH": return t.crew_region_gyeonggi_south;
    case "GYEONGGI_NORTH": return t.crew_region_gyeonggi_north;
    case "GANGWON": return t.crew_region_gangwon;
    case "CHUNGBUK": return t.crew_region_chungbuk;
    case "CHUNGNAM": return t.crew_region_chungnam;
    case "JEONBUK": return t.crew_region_jeonbuk;
    case "JEONNAM": return t.crew_region_jeonnam;
    case "GYEONGBUK": return t.crew_region_gyeongbuk;
    case "GYEONGNAM": return t.crew_region_gyeongnam;
    case "JEJU": return t.crew_region_jeju;
    case "ONLINE": return t.crew_region_online;
    default: return t.crew_region_etc;
  }
}
