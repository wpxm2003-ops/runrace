"use client";

import { Card } from "@/app/_components/ui/Card";
import { useLocale } from "@/lib/i18n";

/** "로딩 중" 안내 카드 — auth 게이트·데이터 로딩 플레이스홀더 공통. */
export function LoadingCard() {
  const { t } = useLocale();
  return <Card className="text-sm text-zinc-600">{t.loading}</Card>;
}
