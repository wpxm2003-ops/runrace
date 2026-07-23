import type { ReactNode } from "react";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { toDisplayError } from "@/lib/api";

/**
 * useMyCrew의 "에러거나 로딩 중이면 카드 하나로 조기 반환" — crew 홈/설정 페이지가
 * 동일하게 구현하던 것을 공유한다. 정상이면 null(호출부가 이어서 렌더링).
 */
export function crewLoadState(
  error: unknown,
  isLoading: boolean,
  hasData: boolean,
  skeletonCount = 3,
  errorMessage = toDisplayError(error),
): ReactNode | null {
  if (error) {
    return (
      <Card>
        <Alert>{errorMessage}</Alert>
      </Card>
    );
  }
  if (isLoading && !hasData) {
    return (
      <Card>
        <SkeletonLines count={skeletonCount} />
      </Card>
    );
  }
  return null;
}
