# Android APK — Google 로그인 · API

## Google 로그인 (네이티브)

APK WebView에서는 `signInWithPopup`이 **Chrome으로만** 열리고 앱으로 돌아오지 않습니다.  
`@capacitor-firebase/authentication` 네이티브 로그인을 사용합니다.

### 1. Firebase에 Android 앱 등록

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 `runrace-3c8fc`
2. **프로젝트 설정** → **앱 추가** → **Android**
3. 패키지 이름: `com.runrace.app`
4. **google-services.json** 다운로드 → 아래 경로에 저장:

   `frontend/android/app/google-services.json`

### 2. 디버그 SHA-1 등록 (필수)

PowerShell:

```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

출력의 **SHA1** 을 Firebase → Android 앱 → **지문 추가**에 넣습니다.

예시(이 PC 디버그 키):

```
SHA1: A2:FC:D8:2F:BA:96:0B:D5:6B:E9:1E:4B:C7:0C:60:4D:F2:AE:F0:03
```

### 2-1. google-services.json 확인 (중요)

SHA-1을 넣기 **전** 받은 파일이면 `oauth_client`에 **웹만** 있고 Android가 없습니다.

```json
"client_type": 3
```

SHA-1 등록 후 **다시 다운로드**하면 아래처럼 **Android 클라이언트**가 생깁니다.

```json
"client_type": 1,
"android_info": {
  "package_name": "com.runrace.app",
  "certificate_hash": "..."
}
```

`client_type: 1` 이 없으면 APK에서 `No credentials available` 오류가 납니다.

### 3. APK 재빌드

```powershell
cd C:\workspace\runrace\frontend
$env:NODE_ENV="production"
npm run build
npx cap sync android
cd android
.\gradlew.bat clean assembleDebug
```

## 레이스 API (`Failed to fetch`)

- `capacitor.config.ts` 에 **CapacitorHttp** 활성화 → WebView CORS 우회
- EC2 `RUNRACE_CORS_ALLOWED_ORIGINS` 에 `http://localhost,https://localhost` 포함 후 `sudo systemctl restart runrace`
