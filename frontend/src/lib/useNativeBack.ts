import { useEffect, useRef } from "react";
import { pushBackInterceptor } from "@/lib/nativeNav";

/**
 * 네이티브 하드웨어 백버튼을 가로채는 훅.
 * active가 true인 동안 백버튼은 SPA 네비게이션 대신 onBack을 호출한다.
 *
 * 사용 예시 — 바텀시트/모달:
 *   useNativeBack(onClose)            // 항상 활성
 *   useNativeBack(onClose, isOpen)    // isOpen일 때만 활성
 */
export function useNativeBack(onBack: () => void, active = true): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return pushBackInterceptor(() => onBackRef.current());
  }, [active]);
}
