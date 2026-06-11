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
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share(text ? { title, text, url } : { title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return "shared";
    throw e;
  }
}
