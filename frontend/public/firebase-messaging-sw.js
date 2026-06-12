/* RunRace 웹 푸시 서비스워커 — iOS PWA/웹 백그라운드 알림 표시.
   설정은 /firebase/init.json에서 읽는다. messagingSenderId/apiKey가 없으면 조용히 비활성(스캐폴딩). */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

(async () => {
  try {
    const res = await fetch("/firebase/init.json");
    if (!res.ok) return;
    const cfg = await res.json();
    // 웹 푸시 미설정 시(센더ID 없음) 초기화하지 않는다 — 비활성 유지.
    if (!cfg.apiKey || !cfg.messagingSenderId) return;

    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const n = (payload && payload.notification) || {};
      self.registration.showNotification(n.title || "RunRace", {
        body: n.body || "",
        data: (payload && payload.data) || {},
      });
    });
  } catch {
    // 미지원/네트워크/설정 미비 — 비활성
  }
})();

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
