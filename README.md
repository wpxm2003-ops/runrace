# RunRace

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
$env:MAVEN_OPTS="-Xmx512m"; ./mvnw spring-boot:run "-Dspring-boot.run.profiles=local"
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

### 빌드

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
MAVEN_OPTS="-Xmx512m" ./mvnw -q -DskipTests package

sudo systemctl restart runrace
```

### 배포 확인

```bash
# 실시간 로그
sudo journalctl -u runrace -f

# 기동 확인 (Started BackendApplication 나오면 OK)
sudo journalctl -u runrace -n 30 --no-pager

# API 응답 확인
curl http://localhost:8081/actuator/health
```
