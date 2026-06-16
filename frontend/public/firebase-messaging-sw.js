/* RunRace 웹 푸시 서비스워커 — FCM 백그라운드 알림 표시.
   firebase-messaging-compat를 동기 초기화해서, 앱이 백그라운드/종료 상태일 때
   notification 메시지를 SDK가 자동으로 표시한다(Android/데스크톱/ iOS PWA 공통).
   포그라운드(앱 화면 켜진 상태)는 페이지의 onMessage가 처리한다. */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

// 공개 설정값(클라이언트에 그대로 노출되는 값) — 동기 초기화로 푸시 누락 방지.
firebase.initializeApp({
  apiKey: "AIzaSyAdQn5v1Rkp46ycQ8v_jt1JVKBWJN-2Dt4",
  projectId: "runrace-3c8fc",
  messagingSenderId: "264137799530",
  appId: "1:264137799530:web:02e5f002c68bcbaf4d9713",
});

// messaging()만 호출해두면 notification 메시지는 백그라운드에서 자동 표시된다.
firebase.messaging();

// 새 SW가 곧바로 활성화돼 기존(구버전) SW를 대체하도록 한다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
