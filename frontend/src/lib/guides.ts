import type { Translations } from "@/lib/i18n/translations";

/** 이용 가이드 항목. 추후 가이드가 늘면 이 배열에 추가하고 /guides/<slug> 정적 페이지를 만든다. */
export type GuideEntry = {
  slug: string;
  href: string;
  title: (t: Translations) => string;
  desc: (t: Translations) => string;
};

export const GUIDES: GuideEntry[] = [
  {
    slug: "ios",
    href: "/guides/ios",
    title: (t) => t.guide_ios_title,
    desc: (t) => t.guide_ios_card_desc,
  },
];
