"use client";

import { reportClientError } from "@/lib/api";
import { useEffect } from "react";

/**
 * React 트리 밖에서 발생하는 런타임 에러를 잡아 백엔드로 보고한다.
 * (Error Boundary는 렌더 에러만 잡으므로 이벤트 핸들러·비동기 에러는 이쪽에서 처리.)
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void reportClientError({
        message: event.message || String(event.error),
        stack: event.error instanceof Error ? event.error.stack : null,
        kind: "error",
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      void reportClientError({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : null,
        kind: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
