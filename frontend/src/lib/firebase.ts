import { initializeApp, getApps } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  // 웹 Firebase Analytics용 — 미설정 시 analytics는 비활성(조용히 무시)
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

if (typeof window !== "undefined") {
  void setPersistence(auth, browserLocalPersistence);
}
