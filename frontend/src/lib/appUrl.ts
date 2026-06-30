/** 클라이언트에서 앱 베이스 URL을 반환한다. */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://runrace.co.kr";
}

/** 가이드 페이지 공유 — shareCard를 지연 로드해 앱 URL+경로로 공유 시트를 연다. */
export async function shareGuide(path: string, title: string) {
  const { shareLink } = await import("@/lib/shareCard");
  return shareLink(`${getAppUrl()}${path}`, title);
}
