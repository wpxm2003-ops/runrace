package com.runrace.app;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    /**
     * 렌더러가 이 간격 안에 두 번 죽으면 복구를 포기한다. 메모리 압박이 계속되는 기기에서
     * 재생성을 반복하면 같은 자리에서 무한히 되살아나기만 한다.
     */
    private static final long RENDERER_RECOVERY_WINDOW_MS = 30_000L;

    /** 액티비티가 재생성돼도 값이 유지돼야 연속 사망을 판별할 수 있어 static이다. */
    private static long lastRendererGoneAtMs = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyLightStatusBar();
        registerRendererRecovery();
    }

    /**
     * WebView 렌더러 프로세스가 죽었을 때 앱 프로세스가 함께 죽는 것을 막는다.
     *
     * <p>Capacitor의 기본 동작은 {@code WebViewListener.onRenderProcessGone}이 false를
     * 반환하는 것이고(리스너를 등록하지 않으면 항상 false), 그러면 프레임워크가 앱 프로세스를
     * 그대로 종료한다. 지도(WebGL)를 띄운 상태에서 저메모리 기기가 렌더러를 회수하면
     * 자바 스택 하나 없이 앱이 사라지는데, 사용자 눈에는 원인 불명의 강제 종료로 보인다.
     *
     * <p>렌더러가 죽은 WebView는 재사용할 수 없으므로 화면에서 떼어내고 파기한 뒤 액티비티를
     * 다시 만든다. 운동 세션은 localStorage에 주기적으로 저장되므로 재생성 후 복원된다.
     */
    private void registerRendererRecovery() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                long now = SystemClock.elapsedRealtime();
                boolean repeated = lastRendererGoneAtMs != 0L
                        && now - lastRendererGoneAtMs < RENDERER_RECOVERY_WINDOW_MS;
                lastRendererGoneAtMs = now;
                if (repeated) {
                    // 재생성 루프로 들어가느니 프레임워크에 넘긴다(기존 동작과 동일).
                    Logger.error("WebView renderer died again; giving up recovery", null);
                    return false;
                }
                Logger.error("WebView renderer gone (didCrash=" + detail.didCrash()
                        + "); recreating activity", null);
                ViewGroup parent = (ViewGroup) webView.getParent();
                if (parent != null) parent.removeView(webView);
                webView.destroy();
                getWindow().getDecorView().post(MainActivity.this::recreate);
                return true;
            }
        });
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
