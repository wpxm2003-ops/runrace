/** 친구 초대 수락 링크. 공유용 절대 URL. */
export function friendAcceptUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/friends/accept?code=${code}`;
}

/** 현재 URL 쿼리스트링에서 초대 코드를 읽는다. */
export function readInviteCodeFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("code");
}
