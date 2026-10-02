"use client";

import { Card } from "@/app/_components/ui/Card";
import { useLocale } from "@/lib/i18n";

/** NSM 소개(정적 콘텐츠). auth 로딩 중에도 렌더해 프리렌더 HTML에 본문을 남긴다. */
export function NsmIntroCard() {
  const { t } = useLocale();
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
          <span>{t.nsm_seo_title}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <p className="text-sm leading-relaxed text-zinc-600">{t.nsm_seo_body1}</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t.nsm_seo_body2}</p>
        </div>
      </details>
    </Card>
  );
}
