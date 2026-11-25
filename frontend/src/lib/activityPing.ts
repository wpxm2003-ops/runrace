import type { User } from "firebase/auth";
import { apiFetch } from "./api/client";
import type { ClientPlatform } from "./clientPlatform";
import { localText } from "./safeStorage";

/**
 * 마지막으로 성공한 일일 활성 핑 표시 — "uid|yyyy-MM-dd"(기기 현지 날짜).
 * 같은 계정·같은 날이면 다시 보내지 않는다. 계정을 바꾸면 표시가 달라져 새로 보낸다.
 */
const LAST_PING_KEY = "runrace_activity_ping";
const lastPing = localText(LAST_PING_KEY);

/** 기기 현지 날짜 yyyy-MM-dd. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 기기 IANA 시간대. 서버가 그 날의 현지 날짜를 정하는 데만 쓰고 저장하지 않는다. 가입 직후에는
 * users.time_zone이 아직 기본값(Asia/Seoul)이라 이 값이 없으면 해외 가입 당일 방문이 다른 날짜로
 * 기록된다. 얻지 못하면 보내지 않는다(서버가 저장된 시간대로 계산).
 */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

let inFlight: { marker: string; promise: Promise<void> } | null = null;

/**
 * 일일 활성 핑(POST /api/activity/ping) — 앱 부팅·포그라운드 복귀 때 부르되 기기 현지 날짜로
 * 하루 한 번만 실제로 보낸다. 서버도 같은 날 중복을 무시하므로(사용자 현지 날짜 기준) 여러 탭·
 * 재설치로 두 번 가도 숫자는 늘지 않는다.
 *
 * 실패하면 표시를 남기지 않아 다음 복귀 때 다시 시도한다. 측정용이라 실패해도 화면 흐름을
 * 막지 않고, 401이어도 로그인 화면으로 보내지 않는다.
 */
export function pingDailyActivity(
  user: User,
  platform: ClientPlatform,
  now: Date = new Date(),
): Promise<void> {
  const marker = `${user.uid}|${localDateKey(now)}`;
  if (lastPing.get() === marker) return Promise.resolve();
  if (inFlight?.marker === marker) return inFlight.promise;

  const promise = apiFetch<unknown>("/api/activity/ping", {
    method: "POST",
    user,
    body: { platform, timeZone: deviceTimeZone() },
    redirectOn401: false,
  })
    .then(() => {
      lastPing.set(marker);
    })
    .catch(() => {
      // 다음 포그라운드 복귀 때 재시도
    })
    .finally(() => {
      if (inFlight?.marker === marker) inFlight = null;
    });
  inFlight = { marker, promise };
  return promise;
}
