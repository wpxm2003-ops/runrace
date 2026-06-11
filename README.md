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
MAVEN_OPTS="-Xmx512m" ./mvnw -q clean package -DskipTests

sudo systemctl restart runrace
```


---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 빌드 중 멈춤 / 서버 다운 | RAM 부족(OOM) | 스왑 확인(`free -h`) 후 빌드. 스왑 없으면 위 "스왑 재설정" |
| `zip file is empty` 빌드 에러 | 이전에 죽은 빌드가 깨진 jar를 남김 | `./mvnw clean package` (clean으로 제거) |
| `Access key ID cannot be blank` 기동 실패 | 손으로 `java -jar` 실행해 환경변수 누락 | `sudo systemctl restart runrace` 로 실행 |
| 웹만 옛 서버로 접속(타임아웃), 앱은 정상 | 브라우저/Service Worker 캐시 | F12 → Application → Clear site data |
| 재부팅 후 백엔드 안 뜸 | — | `runrace.service`는 enabled라 자동 기동. 안 뜨면 `systemctl status runrace` 확인 |

---

## 사용 도구 및 버전

### 백엔드 (`backend/pom.xml`)

| 도구 | 버전 |
|------|------|
| Java | 21 |
| Spring Boot | 3.4.5 |
| Spring Web / Data JPA / Validation / Cache | Spring Boot 관리 |
| Hibernate (JPA) | Spring Boot 관리 |
| QueryDSL (jakarta) | 5.1.0 |
| Flyway (PostgreSQL) | Spring Boot 관리 |
| PostgreSQL JDBC 드라이버 | Spring Boot 관리 |
| Caffeine (캐시) | Spring Boot 관리 |
| Firebase Admin SDK | 9.4.3 |
| AWS SDK for Java — S3 | 2.26.12 |
| Lombok | Spring Boot 관리 |
| 빌드 도구 | Maven Wrapper (`mvnw`) |

### 프론트엔드 (`frontend/package.json`)

| 도구 | 버전 |
|------|------|
| Next.js | 16.2.7 |
| React / React DOM | 19.2.4 |
| TypeScript | ^5 |
| Tailwind CSS | ^4 |
| SWR | ^2.4.1 |
| Leaflet | 1.9.4 |
| react-leaflet | ^5.0.0 |
| Firebase (Web SDK) | ^12.14.0 |
| Capacitor (core/cli/android/ios) | ^8.3.4 |
| @capacitor-firebase/authentication | ^8.2.0 |
| @capacitor-firebase/messaging | ^8.3.0 |
| @capacitor-community/background-geolocation | ^1.2.26 |
| exifr (EXIF 파싱) | ^7.1.3 |
| ESLint | ^9 |

### 인프라 (`infra/docker-compose.yml`)

| 도구 | 버전 |
|------|------|
| PostgreSQL | 16 |
| Adminer | 4 |
| 컨테이너 | Docker Compose |
| 배포 | EC2 + Nginx + systemd |
