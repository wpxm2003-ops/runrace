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

### 4) 백엔드 CORS

`runrace` systemd에 프론트 origin 추가 후 재시작:

```ini
Environment=RUNRACE_CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://<EC2_퍼블릭_IP>
```

```bash
cd ~/runrace/backend && ./mvnw -q -DskipTests package
sudo systemctl restart runrace
```

`infra/systemd/runrace.service.example` 참고.

## 운동하기 GPS (HTTPS)

브라우저 Geolocation은 **HTTPS** 또는 **localhost** 에서만 동작합니다. `http://<EC2_IP>` 로 접속하면 지도에 GPS 오류가 납니다. 운영 시 도메인 + Let's Encrypt(SSL) 적용이 필요합니다.