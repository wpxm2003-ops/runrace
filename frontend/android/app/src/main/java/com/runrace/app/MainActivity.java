package com.runrace.app;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyLightStatusBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyLightStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 콜드 스타트 후 재진입(warm start) 시 WebView가 다 뜬 뒤 시스템이 상태바 외형을
        // 비동기로 되돌리는 경우가 있다. 포커스 획득 시점에 다시 적용해야 확실히 잡힌다.
        if (hasFocus) {
            applyLightStatusBar();
        }
    }

    /**
     * 앱 배경이 흰색이라 상태바 아이콘을 어둡게(라이트 상태바) 해야 시계·아이콘이 보인다.
     * targetSdk 36은 edge-to-edge 강제 → statusBarColor는 무시되고 아이콘 색만 제어 가능.
     * 테마 windowLightStatusBar가 WebView 진입 후 풀리므로 코드로, 그리고 현재 프레임
     * 이후(post)에 적용해 비동기 리셋을 덮어쓴다.
     */
    private void applyLightStatusBar() {
        getWindow().getDecorView().post(() -> {
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(true);
        });
    }
}
