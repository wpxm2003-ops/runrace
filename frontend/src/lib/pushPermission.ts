import { Capacitor } from "@capacitor/core";

/**
 * 화면이 판단에 쓰는 알림 권한 상태.
 * - granted: 허용됨
 * - prompt: OS가 아직 물어볼 수 있음(처음이거나, 한 번 거부해 rationale 상태)
 * - denied: OS가 더 이상 묻지 않음 — 휴대폰 설정에서만 켤 수 있음
 * - unsupported: 네이티브 앱이 아님(웹·PWA)
 */
export type NotificationPermissionState = "granted" | "prompt" | "denied" | "unsupported";

/**
 * FirebaseMessaging의 receive 값을 화면용 상태로 줄인다.
 * Android 13+에서 한 번 거부하면 "prompt-with-rationale"이 되는데, 이때는 OS가 팝업을 한 번 더
 * 띄울 수 있으므로 prompt로 본다. 두 번째 거부부터 "denied"(다시 묻지 않음)다.
 */
export function normalizeNotificationPermission(
  receive: string | null | undefined,
): Exclude<NotificationPermissionState, "unsupported"> {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

async function messaging() {
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  return FirebaseMessaging;
}

/** 현재 알림 권한 상태를 조회한다. OS 팝업을 띄우지 않는다. */
export async function checkNotificationPermission(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  const { receive } = await (await messaging()).checkPermissions();
  return normalizeNotificationPermission(receive);
}

/**
 * OS 알림 권한 팝업을 띄운다. 사용자가 "알림 받기"·토글을 누른 직후에만 호출한다.
 * 거부하면 OS가 다시 물을 수 있는지에 따라 prompt 또는 denied를 돌려준다.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  const { receive } = await (await messaging()).requestPermissions();
  return normalizeNotificationPermission(receive);
}

/** push_permission_result 이벤트 값 — OS 팝업 결과를 허용/거부 둘로 나눈다. */
export function permissionResultLabel(state: NotificationPermissionState): "granted" | "denied" {
  return state === "granted" ? "granted" : "denied";
}

// ── FCM 토큰 동기화 연결 ──────────────────────────────────────────
// 토큰 취득·서버 등록·tokenReceived 리스너는 FcmBootstrap 한곳이 맡는다(기존 경로).
// 권한을 막 허용한 화면은 이 연결로 FcmBootstrap에 동기화를 요청하고, 등록이 끝나면 알림을 받는다.

type TokenSyncHandler = () => Promise<boolean>;

let tokenSyncHandler: TokenSyncHandler | null = null;
const tokenRegisteredListeners = new Set<() => void>();

/** FcmBootstrap이 로그인 중에 토큰 동기화 함수를 건다. 반환값으로 해제한다. */
export function setPushTokenSyncHandler(handler: TokenSyncHandler): () => void {
  tokenSyncHandler = handler;
  return () => {
    if (tokenSyncHandler === handler) tokenSyncHandler = null;
  };
}

/**
 * 토큰을 지금 등록하도록 요청한다. 등록(또는 이미 등록됨)이면 true,
 * 로그아웃 상태·권한 없음·FCM 실패면 false.
 */
export async function requestPushTokenSync(): Promise<boolean> {
  const handler = tokenSyncHandler;
  if (!handler) return false;
  try {
    return await handler();
  } catch {
    return false;
  }
}

/** 서버에 토큰이 등록될 때마다 호출된다(알림 설정 화면 새로고침용). 반환값으로 해제한다. */
export function onPushTokenRegistered(listener: () => void): () => void {
  tokenRegisteredListeners.add(listener);
  return () => {
    tokenRegisteredListeners.delete(listener);
  };
}

export function notifyPushTokenRegistered(): void {
  for (const listener of [...tokenRegisteredListeners]) {
    try {
      listener();
    } catch {
      // 구독자 오류가 다른 구독자·토큰 등록 흐름을 막지 않게 한다.
    }
  }
}
