import { Capacitor } from "@capacitor/core";

/**
 * URL 링크를 공유한다.
 * - 네이티브 / Web Share API 지원 환경: 시스템 공유 시트
 * - 미지원 환경: 클립보드 복사 후 'copied' 반환
 */
export async function shareLink(
  url: string,
  title: string,
  text?: string,
): Promise<"shared" | "copied"> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      // title은 공유 시트 제목(dialogTitle)으로만 사용 — 전달 메시지엔 URL만(text 있으면 함께) 넣어 "앱이름 - " 접두어 제거
      await Share.share({ text, url, dialogTitle: title });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share(text ? { text, url } : { url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return "shared";
    throw e;
  }
}
