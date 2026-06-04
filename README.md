# RunRace MVP (runrace/)

## 로컬 실행

### 1) DB 실행

```bash
cd infra
docker compose up -d
```

- Postgres: `localhost:5432` (db/user/pass = `runrace`)
- Adminer: `http://localhost:8088`

### 2) 백엔드 실행

```bash
cd backend
set FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\firebase-service-account.json
.\mvnw.cmd spring-boot:run
```

기본 포트: `8081`

### 3) 프론트 실행

```bash
cd frontend
npm run dev
```

## Capacitor 빌드(정적 export 기준)

```bash
cd frontend
npm run build
npx cap copy
```

## EC2 프론트 배포 (Nginx + 정적 export)

### 1) 로컬에서 빌드

`frontend/.env.production` (`.env.production.example` 참고):

```env
NEXT_PUBLIC_API_BASE_URL=http://<EC2_퍼블릭_IP>:8081
# Firebase 키는 .env.local 과 동일
```

```bash
cd frontend
npm run build
tar -czf out.tar.gz -C out .
```

`out/` 폴더가 생성됩니다.

### 2) EC2로 업로드

```bash
scp -i "C:\Users\wpxm2\Downloads\runrace_ec2_key_pair.pem" out.tar.gz ec2-user@<IP>:/tmp/
```

EC2 SSH:

```bash
sudo rm -rf /var/www/runrace/*
sudo tar -xzf /tmp/out.tar.gz -C /var/www/runrace
sudo systemctl reload nginx
```

### 3) Nginx

```bash
sudo dnf install -y nginx
sudo cp ~/runrace/infra/nginx/runrace.conf /etc/nginx/conf.d/runrace.conf
sudo nginx -t && sudo systemctl enable --now nginx
```

보안 그룹: **80** 인바운드 허용. 브라우저 `http://<IP>/`

페이지 이동 403 시: `try_files`에서 `$uri.html`을 `$uri/`보다 먼저 (`infra/nginx/runrace.conf` 참고).


## Android APK 빌드 (Capacitor)

### 1) 준비

- [Android Studio](https://developer.android.com/studio) 설치 (SDK 자동 설치됨)
- `frontend/android/local.properties` 파일 생성:

```
sdk.dir=C\:\\Users\\<사용자명>\\AppData\\Local\\Android\\Sdk
```

### 2) 빌드

```bash
cd frontend
npm run build
npx cap copy android
npx cap sync android
```

```powershell
cd frontend\android
.\gradlew assembleDebug
```

APK 위치: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 3) 설치

USB 연결 또는 파일 전송 후:

```powershell
# adb로 직접 설치
adb install app\build\outputs\apk\debug\app-debug.apk
```

---

## 백엔드 EC2 배포 (Git)

EC2에 이미 `~/runrace` 레포가 클론되어 있다는 전제입니다.

### 로컬에서 푸시

```bash
git add .
git commit -m "..."
git push origin main
```

### EC2에서 풀 & 빌드 & 재시작

```bash
ssh -i "C:\Users\wpxm2\Downloads\runrace_ec2_key_pair.pem" ec2-user@<IP>
```

```bash
cd ~/runrace
git pull origin main

cd backend
./mvnw -q -DskipTests package

sudo systemctl restart runrace
sudo journalctl -u runrace -f   # 로그 실시간 확인 (Ctrl+C로 종료)
```

### 확인

```bash
# 백엔드 정상 기동 확인 (Started BackendApplication 나오면 OK)
sudo journalctl -u runrace -n 30 --no-pager

# API 응답 확인
curl http://localhost:8081/actuator/health
```

---