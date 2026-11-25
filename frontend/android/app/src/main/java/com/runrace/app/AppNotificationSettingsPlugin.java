package com.runrace.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 이 앱의 OS 알림 설정 화면을 연다.
 *
 * <p>알림 권한을 두 번 거부하면 Android는 더 이상 권한 팝업을 띄우지 않아 앱 안에서는 다시 켤 수
 * 없다. 그런 사용자를 휴대폰 설정의 "RunRace > 알림" 화면으로 바로 보낸다. Android 8(API 26)
 * 미만이거나 알림 설정 화면이 없는 기기에서는 앱 정보 화면으로 대신 연다.
 *
 * <p>JS 쪽(src/lib/appNotificationSettings.ts)은 이 플러그인이 없는 기존 APK에서도 동작해야
 * 하므로, 등록 여부를 먼저 확인하고 없으면 단계 안내를 보여 준다.
 */
@CapacitorPlugin(name = "AppNotificationSettings")
public class AppNotificationSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String packageName = getContext().getPackageName();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent notificationSettings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName);
            if (tryStart(notificationSettings)) {
                resolve(call, "notifications");
                return;
            }
        }

        Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", packageName, null));
        if (tryStart(appDetails)) {
            resolve(call, "app_details");
            return;
        }

        call.reject("settings_unavailable");
    }

    /** 앱 태스크 위에 띄워 설정에서 뒤로가기를 누르면 앱으로 돌아오게 한다. */
    private boolean tryStart(Intent intent) {
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    private static void resolve(PluginCall call, String screen) {
        JSObject result = new JSObject();
        result.put("screen", screen);
        call.resolve(result);
    }
}
