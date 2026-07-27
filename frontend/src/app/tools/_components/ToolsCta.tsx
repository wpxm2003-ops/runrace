"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

/** 도구 페이지 하단 공통 CTA — 검색 유입 방문자를 앱 홈(온보딩)으로 보낸다. */
export function ToolsCta() {
  const { t } = useLocale();

  return (
    <div className="mt-8 rounded-2xl bg-zinc-900 p-5 shadow-sm">
      <div className="text-base font-semibold text-white">{t.tools_cta_title}</div>
      <p className="mt-1 text-sm text-zinc-400">{t.tools_cta_desc}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
      >
        {t.tools_cta_btn}
      </Link>
    </div>
  );
}

/** 도구 상세 → 목록으로 돌아가는 내부 링크(내부 링크 구조 강화용). */
export function ToolsMoreLink() {
  const { t } = useLocale();

  return (
    <div className="mt-4 text-center">
      <Link href="/tools" className="text-sm text-zinc-500 underline hover:text-zinc-700">
        {t.tools_more}
      </Link>
    </div>
  );
}
