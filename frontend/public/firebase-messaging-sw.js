/* RunRace 웹 푸시 서비스워커 — iOS PWA/웹 백그라운드 알림 표시.
   표준 push 이벤트만으로 표시한다(FCM SDK 미초기화):
   - iOS PWA는 FCM onBackgroundMessage가 아니라 표준 push 이벤트로 전달된다.
   - FCM SDK까지 초기화하면 push 핸들러가 이중 등록돼 알림이 두 번 뜨거나 충돌한다.
   백엔드가 웹 플랫폼엔 data.title/body도 함께 실어 보내므로 SDK 없이 파싱 가능. */

// 새 SW가 곧바로 활성화돼 기존(구버전) SW를 대체하도록 한다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function showFromPayload(payload) {
  const n = (payload && payload.notification) || {};
  const data = (payload && payload.data) || {};
  const title = n.title || data.title || "RunRace";
  const body = n.body || data.body || "";
  return self.registration.showNotification(title, {
    body,
    data,
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(showFromPayload(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    }),
  );
});
