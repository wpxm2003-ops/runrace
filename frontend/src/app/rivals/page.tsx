"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { pageLoading } from "@/app/_components/pageLoading";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { usePageScrollRestore } from "@/lib/pageStateStore";
import { useLocale } from "@/lib/i18n";
import { RivalPreviewSection } from "./_components/RivalPreviewSection";
import { RivalAddSection } from "./_components/RivalAddSection";
import { RivalListSection } from "./_components/RivalListSection";

export default function RivalsPage() {
  const { user, loading } = useRequireAuth("/rivals");
  const { t } = useLocale();
  // 다른 화면에 다녀와도 스크롤 유지 (내정보 탭과 동일 동작)
  usePageScrollRestore("page:rivals");

  if (loading || !user) {
    return pageLoading(t.rival_manage);
  }

  return (
    <PageLayout title={t.rival_manage}>
      <RivalPreviewSection />
      <RivalAddSection user={user} />
      <RivalListSection user={user} />
    </PageLayout>
  );
}
