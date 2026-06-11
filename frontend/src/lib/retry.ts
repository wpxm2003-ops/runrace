/**
 * 일시적 실패(서버 재시작·네트워크 깜빡임)에 대비한 자동 재시도.
 * attempts회 시도하며 실패 시 delayMs 간격으로 재시도하고, 모두 실패하면 마지막 에러를 던진다.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 3000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
