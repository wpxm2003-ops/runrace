/** API fetch 실패 시 status를 담아 SWR 재시도 여부를 판단한다. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * 표시용 에러 메시지 병합. 인자 순서대로 첫 번째 존재하는 에러를 문자열로 반환한다.
 * (액션 에러를 페치 에러보다 앞에 두면 우선 표시된다.) 모두 없으면 null.
 */
export function firstErrorMessage(...errors: unknown[]): string | null {
  for (const e of errors) {
    if (e != null) return String(e);
  }
  return null;
}

export function isRetryableApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500;
  }
  if (err instanceof Error) {
    const match = err.message.match(/^API (\d{3}):/);
    if (match) {
      const status = Number(match[1]);
      return status >= 500;
    }
  }
  // 네트워크 단절·타임아웃 등 (status 없음)
  return true;
}
