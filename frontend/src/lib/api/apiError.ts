/** API fetch 실패 시 status를 담아 SWR 재시도 여부를 판단한다. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
