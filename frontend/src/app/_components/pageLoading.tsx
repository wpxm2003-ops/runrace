import { PageLayout } from "@/app/_components/PageLayout";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";

/**
 * 인증 게이트·초기 로딩의 공용 셸(제목 + 로딩 카드) — crewLoadState처럼 일반 함수가
 * JSX를 반환한다. `if (loading) return pageLoading(t.xxx_title)` 형태의 조기 반환용.
 */
export function pageLoading(title: string, maxWidth?: "max-w-2xl" | "max-w-md") {
  return (
    <PageLayout title={title} maxWidth={maxWidth}>
      <LoadingCard />
    </PageLayout>
  );
}
