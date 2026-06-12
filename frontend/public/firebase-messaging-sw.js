/* RunRace 웹 푸시 서비스워커 — iOS PWA/웹 백그라운드 알림 표시.
   iOS PWA는 Firebase onBackgroundMessage 대신 표준 push 이벤트로 전달되는 경우가 많다. */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

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

(async () => {
  try {
    const res = await fetch("/firebase/init.json");
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg.apiKey || !cfg.messagingSenderId) return;
    firebase.initializeApp(cfg);
    firebase.messaging();
  } catch {
    // push 이벤트 핸들러만으로도 iOS PWA 알림 표시 가능
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
