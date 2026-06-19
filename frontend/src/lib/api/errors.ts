import { auth } from "@/lib/firebase";
import { apiUrl } from "./client";

export type ClientErrorReport = {
  message: string;
  stack?: string | null;
  /** 'error' | 'unhandledrejection' | 'react' 등 */
  kind?: string;
  url?: string;
};

const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;

// 같은 에러가 렌더 루프 등으로 폭주해 DB를 채우지 않도록 세션 단위로 1회만 보고한다.
const reported = new Set<string>();

/**
 * 클라이언트 에러를 백엔드 수집 엔드포인트로 best-effort 전송한다.
 * 절대 throw 하지 않으며(보고 실패가 새 에러를 만들지 않도록), 로그인 상태면 토큰을 실어 user_id를 남긴다.
 */
export async function reportClientError(report: ClientErrorReport): Promise<void> {
  try {
    const message = (report.message || "(no message)").slice(0, MAX_MESSAGE);
    const url =
      report.url ?? (typeof window !== "undefined" ? window.location.href : undefined);

    const signature = `${report.kind ?? "error"}|${message}|${url ?? ""}`;
    if (reported.has(signature)) return;
    reported.add(signature);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const user = auth.currentUser;
    if (user) {
      try {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      } catch {
        // 토큰 없이 익명으로 보고
      }
    }

    await fetch(apiUrl("/api/client-errors"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        stack: report.stack ? report.stack.slice(0, MAX_STACK) : null,
        url,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        kind: report.kind ?? "error",
      }),
      keepalive: true,
    });
  } catch {
    // 보고 자체의 실패는 무시한다.
  }
}
