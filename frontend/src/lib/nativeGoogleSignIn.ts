import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

/** 웹: popup. APK: 네이티브 Google(Chrome 이탈·복귀 없음 방지) */
export async function signInWithGoogleApp(): Promise<UserCredential> {
  if (!Capacitor.isNativePlatform()) {
    return signInWithPopup(auth, new GoogleAuthProvider());
  }

  let result;
  try {
    // Credential Manager는 SHA-1 미등록 시 "No credentials available" 가 자주 남
    result = await FirebaseAuthentication.signInWithGoogle({
      useCredentialManager: false,
    });
  } catch (e) {
    const msg = String(e);
    if (/no credentials available/i.test(msg)) {
      throw new Error(
        "Google 로그인 설정이 아직 안 됐습니다. Firebase Console → Android 앱(com.runrace.app)에 디버그 SHA-1을 등록한 뒤 google-services.json을 다시 받아 APK를 재빌드해 주세요.",
      );
    }
    throw e;
  }
  const idToken = result.credential?.idToken;
  if (!idToken) {
    throw new Error(
      "Google 로그인에 실패했습니다. Firebase Console에 Android 앱(com.runrace.app)·SHA-1·google-services.json 설정을 확인해 주세요.",
    );
  }
  const credential = GoogleAuthProvider.credential(
    idToken,
    result.credential?.accessToken ?? undefined,
  );
  return signInWithCredential(auth, credential);
}
