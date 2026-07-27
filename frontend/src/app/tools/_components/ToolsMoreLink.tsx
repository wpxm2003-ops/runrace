"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

/** 도구 상세에서 계산기 목록으로 돌아가는 링크. */
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
