import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * 이 앱의 OS 알림 설정 화면을 여는 커스텀 네이티브 플러그인
 * (android/app/src/main/java/com/runrace/app/AppNotificationSettingsPlugin.java).
 *
 * WebView는 원격 URL을 띄우므로 웹 배포가 먼저 나가고, 플러그인이 없는 기존 APK에서도 이 코드가
 * 돈다. 그래서 플러그인이 등록돼 있는지 먼저 보고, 없거나 실패하면 "unavailable"을 돌려준다 —
 * 호출부는 그때 "설정 > 애플리케이션 > RunRace > 알림" 단계 안내로 대신한다.
 */
export const APP_NOTIFICATION_SETTINGS_PLUGIN = "AppNotificationSettings";

type AppNotificationSettingsPlugin = {
  open(): Promise<{ screen?: string }>;
};

let plugin: AppNotificationSettingsPlugin | null = null;

function getPlugin(): AppNotificationSettingsPlugin {
  plugin ??= registerPlugin<AppNotificationSettingsPlugin>(APP_NOTIFICATION_SETTINGS_PLUGIN);
  return plugin;
}

export type OpenNotificationSettingsResult = "opened" | "unavailable";

export async function openAppNotificationSettings(): Promise<OpenNotificationSettingsResult> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  if (!Capacitor.isPluginAvailable(APP_NOTIFICATION_SETTINGS_PLUGIN)) return "unavailable";
  try {
    await getPlugin().open();
    return "opened";
  } catch {
    return "unavailable";
  }
}
