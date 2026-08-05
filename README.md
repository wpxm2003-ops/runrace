# RunRace

## UI Guide

- App WebView dropdown rule: [docs/frontend-ui-guidelines.md](docs/frontend-ui-guidelines.md)

친구와 함께하는 러닝 대결 앱

---

## 로컬 실행

### 1. DB 실행

```bash
cd infra
docker compose up -d
```

### 2. 백엔드 실행

`backend/src/main/resources/application-local.yml` 파일 생성 (gitignore 등록됨):

```yaml
app:
  aws:
    access-key: 발급된_액세스키
    secret-key: 발급된_시크릿키
```

```powershell
cd backend
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\path\to\firebase-service-account.json"
$env:MAVEN_OPTS="-Xmx512m"; ./mvnw spring-boot:run
```

기본 포트: `8081`

### 3. 프론트엔드 실행

```bash
cd frontend
npm run dev
```

---

## Android APK 빌드

### 준비

[Android Studio](https://developer.android.com/studio) 설치 후 `frontend/android/local.properties` 생성:

```
sdk.dir=C\:\\Users\\<사용자명>\\AppData\\Local\\Android\\Sdk
```

### 디버그 빌드

```bash
cd frontend
npm run build
npm run cap:sync:android
```

> `cap:sync:android`는 `npx cap sync android` 앞에 `scripts/ensure-cap-webdir.mjs`를 붙인 래퍼다. 원격 서버 모드(`CAPACITOR_SERVER_URL`)처럼 `out/`이 없는 상태에서도 sync가 통과하도록 최소 webDir을 만들어 준다.

```powershell
cd frontend\android
.\gradlew assembleDebug
```

APK 위치: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 릴리스 빌드 (서명)

`frontend/android/keystore.properties` 생성 (gitignore 등록됨):

```
storeFile=릴리스_키스토어_경로
storePassword=...
keyAlias=...
keyPassword=...
```

`storeFile`은 `frontend/android` 기준 상대경로다. 이 파일이 없으면 `signingConfigs.release`가 빈 채로 빌드돼 서명 없는 산출물이 나온다(`frontend/android/app/build.gradle`).

버전은 같은 `build.gradle`의 `versionCode` / `versionName`을 올린다.

```powershell
cd frontend\android
.\gradlew assembleRelease   # APK → app/build/outputs/apk/release/
.\gradlew bundleRelease     # AAB(Play 업로드용) → app/build/outputs/bundle/release/
```

### Google 로그인 (네이티브)

APK WebView에서는 `signInWithPopup`이 Chrome으로만 열리고 앱으로 돌아오지 않는다. 그래서 웹 팝업 대신 `@capacitor-firebase/authentication` 네이티브 로그인을 쓴다.

**`No credentials available` 오류** — 새 개발 PC나 새 `debug.keystore`를 쓸 때마다 재발한다. 그 키의 SHA-1이 Firebase에 없어서 `google-services.json`에 Android OAuth 클라이언트가 들어가지 않은 것이 원인이다.

1. SHA-1 추출: **저장소 루트에서** `.\scripts\android-debug-sha1.ps1` (스크립트는 `frontend/`가 아니라 루트에 있다)
2. Firebase Console → 프로젝트 설정 → Android 앱(`com.runrace.app`) → **지문 추가**에 등록
3. `google-services.json`을 **다시 다운로드**해서 `frontend/android/app/google-services.json` 교체
4. 파일 안 `oauth_client`에 `"client_type": 1`(Android)이 있는지 확인

```json
"client_type": 1,
"android_info": { "package_name": "com.runrace.app", "certificate_hash": "..." }
```

`"client_type": 3`(웹)만 있으면 2번이 아직 반영되지 않은 것이고, APK에서 오류가 그대로 난다.

Play 배포본에서만 로그인이 실패하는 경우도 같은 원인이다. Play 앱 서명을 쓰면 Google이 업로드 키가 아닌 **앱 서명 키**로 재서명하므로, Play Console → 설정 → 앱 서명의 SHA-1도 위 절차대로 Firebase에 등록하고 `google-services.json`을 다시 받아야 한다.

---

## EC2 배포

### 프론트엔드 배포

로컬에서 빌드 후 EC2로 전송:

```bash
cd frontend
npm run build
tar -czf out.tar.gz -C out .
scp -i "C:\Users\wpxm2\Downloads\runrace_ec2_key_pair.pem" out.tar.gz ec2-user@<IP>:/tmp/
```

EC2에서 적용:

```bash
sudo rm -rf /var/www/runrace/*
sudo tar -xzf /tmp/out.tar.gz -C /var/www/runrace
sudo systemctl reload nginx
```

### 백엔드 배포

로컬에서 푸시:

```bash
git add .
git commit -m "..."
git push origin main
```

EC2에서 풀 & 빌드 & 재시작:

```bash
cd ~/runrace
git pull origin main

cd backend
MAVEN_OPTS="-Xmx512m" ./mvnw -q clean package -DskipTests

sudo systemctl restart runrace
```


---

## 운영 헬스체크

앱 + DB 상태를 한 번에 확인:

**Windows (PowerShell)** — `curl`은 `Invoke-WebRequest` 별칭이라 반드시 `curl.exe`를 쓴다:

```powershell
curl.exe -i https://runrace.co.kr/actuator/health
```

**macOS / Linux (EC2 포함)**:

```bash
curl -i https://runrace.co.kr/actuator/health
```

- `{"status":"UP"}` → 정상 (DB 연결 포함)
- `{"status":"DOWN"}` (HTTP 503) → 장애 (DB 끊김 등)

> nginx가 `/actuator/health`만 백엔드(8081)로 프록시한다(`infra/nginx/runrace.conf`). 다른 actuator 엔드포인트·상세 정보는 노출하지 않는다(UP/DOWN만).
> EC2 안에서 백엔드 직접 확인: `curl -i http://localhost:8081/actuator/health`

---

## EC2 환경변수 관리

백엔드 서비스 파일 위치: `/etc/systemd/system/runrace.service`

### 환경변수 추가 방법

```bash
sudo nano /etc/systemd/system/runrace.service
```

`[Service]` 섹션에 아래 형식으로 추가:

```ini
Environment=변수명=값
```

nano 저장 후 닫기: `Ctrl+X` → `Y` → `Enter`
nano 그냥 닫기: `Ctrl+X` → `N`

변경사항 반영:

```bash
sudo systemctl daemon-reload
sudo systemctl restart runrace
```

### SRTM 고도 타일

운영 서버는 운동 상세 조회 시 저장된 GPS 원본 고도를 SRTM 지형고로 교정한다. 원본 경로는
DB에 그대로 남고, 한 좌표라도 DEM 범위를 벗어나면 해당 운동 전체가 GPS 원본으로 표시된다.
DEM과 GPS를 한 차트 안에서 섞지는 않는다.

압축을 푼 `.hgt` 파일을 `/home/ec2-user/runrace-dem`에 둔다. 파일명은
`N37E127.hgt` 형식이어야 하며 아래 두 SRTM 규격만 허용한다.

- 3 arc-second: `1201 x 1201`, `2,884,802 bytes`
- 1 arc-second: `3601 x 3601`, `25,934,402 bytes`

백엔드 배포 스크립트는 AWS Open Data의 Mapzen Skadi 타일에서 위도 `N33~N38`,
경도 `E124~E131`의 한국 영역 48개를 내려받아 크기를 검증한다. 이미 정상 크기로 설치된
타일은 다시 받지 않는다. 수동 설치 시에도 같은 스크립트를 사용한다.

```bash
bash scripts/install-korea-dem.sh /home/ec2-user/runrace-dem
```

`/etc/systemd/system/runrace.service`의 `[Service]`에 다음을 추가한다.

```ini
Environment=DEM_DIR=/home/ec2-user/runrace-dem
Environment=DEM_REQUIRED=true
Environment=DEM_MAX_CACHED_TILES=32
```

`DEM_REQUIRED=true`이면 경로가 없거나 정상 타일이 하나도 없을 때 백엔드가 기동하지 않는다.
반영 후 `journalctl -u runrace -n 100`에서 `DEM 지형고 보정 활성`과 인식된 타일 수를 확인한다.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 빌드 중 멈춤 / 서버 다운 | RAM 부족(OOM) | 스왑 확인(`free -h`) 후 빌드. 스왑이 없으면 `dd`+`mkswap`+`swapon`으로 2GB 스왑 생성 |
| APK에서만 API 호출이 `Failed to fetch` (웹은 정상) | WebView의 오리진이 `localhost`라 CORS에 막힘 | `frontend/capacitor.config.ts`의 `CapacitorHttp.enabled`가 켜져 있는지 확인 + EC2 `RUNRACE_CORS_ALLOWED_ORIGINS`(스프링 키 `runrace.cors.allowed-origins`)에 `http://localhost,https://localhost` 포함 후 `sudo systemctl restart runrace` |
| `zip file is empty` 빌드 에러 | 이전에 죽은 빌드가 깨진 jar를 남김 | `./mvnw clean package` (clean으로 제거) |
| `Access key ID cannot be blank` 기동 실패 | 손으로 `java -jar` 실행해 환경변수 누락 | `sudo systemctl restart runrace` 로 실행 |
| 웹만 옛 서버로 접속(타임아웃), 앱은 정상 | 브라우저/Service Worker 캐시 | F12 → Application → Clear site data |
| 재부팅 후 백엔드 안 뜸 | — | `runrace.service`는 enabled라 자동 기동. 안 뜨면 `systemctl status runrace` 확인 |

---

## 기술 스택

- **백엔드**: Java 21, Spring Boot 3.4.5 (Spring Web · Data JPA), QueryDSL 5.1.0, Flyway
- **프론트엔드**: Next.js 16.2.7, React 19.2, TypeScript 5, Tailwind CSS 4, SWR
- **모바일**: Capacitor 8 (Android)
- **DB / 인프라**: PostgreSQL 16, Docker Compose, EC2 + Nginx
- **외부 연동**: Firebase (인증 · FCM), AWS S3
