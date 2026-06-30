/**
 * 인스타 스토리 카드(1080×1920) 캡처·저장 공용 로직.
 * ShareCardButton·MonthlyRecapCard가 공유한다. DOM(JSX)은 각 컴포넌트가 보유하고,
 * 캡처→네이티브 공유/웹 다운로드만 여기서 처리한다.
 */
export const CARD_W = 1080;
export const CARD_H = 1920;

/** Blob → base64 문자열(데이터 URL 접두어 제거). Capacitor Filesystem 저장용. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 카드 DOM을 PNG로 캡처해 저장한다.
 * - 네이티브: 캐시에 쓰고 OS 공유 시트로 연결. 사용자가 취소하면 'aborted'.
 * - 웹: 즉시 다운로드.
 * 실패(캡처/쓰기 오류)는 throw하여 호출부가 처리한다(AbortError는 호출부가 무시).
 * @param fileNamePrefix 확장자·타임스탬프 제외한 파일명 접두어(예: "runrace", "runrace-recap")
 */
export async function captureAndSaveCard(
  node: HTMLElement,
  fileNamePrefix: string,
  backgroundColor = "#0B0C10",
): Promise<"saved" | "aborted"> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    width: CARD_W,
    height: CARD_H,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor,
  });
  if (!blob) throw new Error("no blob");

  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const written = await Filesystem.writeFile({
      path: `${fileNamePrefix}-${Date.now()}.png`,
      data: base64,
      directory: Directory.Cache,
    });
    const { Share } = await import("@capacitor/share");
    // 공유 시트 취소는 플랫폼마다 다른 에러를 던지므로 별도 처리 — 카드 생성은 성공한 셈.
    try {
      await Share.share({ files: [written.uri] });
    } catch {
      return "aborted";
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileNamePrefix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return "saved";
}
