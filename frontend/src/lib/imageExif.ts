/** 사진 EXIF에서 촬영 시각을 읽는다. 없으면 null. */
export async function readPhotoTakenAt(file: File): Promise<Date | null> {
  try {
    // exifr은 사진 선택 시점에만 필요하므로 지연 로드해 초기 번들에서 제외한다.
    const exifr = (await import("exifr")).default;
    const meta = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "DateTime"],
      reviveValues: true,
    });
    if (!meta) return null;

    const taken =
      (meta.DateTimeOriginal as Date | undefined) ??
      (meta.CreateDate as Date | undefined) ??
      (meta.DateTime as Date | undefined);

    if (!(taken instanceof Date) || Number.isNaN(taken.getTime())) return null;
    // 미래 시각(시계 오차)은 현재 시각으로 제한
    if (taken.getTime() > Date.now() + 5 * 60_000) return null;
    return taken;
  } catch {
    return null;
  }
}

/** 촬영 시각(종료) − 운동 시간 = 시작 시각 ISO 문자열 */
export function workoutStartedAtFromPhotoEnd(
  photoTakenAt: Date,
  durationSec: number,
): string {
  return new Date(photoTakenAt.getTime() - durationSec * 1000).toISOString();
}
