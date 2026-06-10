/** 클라이언트에서 앱 베이스 URL을 반환한다. */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
}
