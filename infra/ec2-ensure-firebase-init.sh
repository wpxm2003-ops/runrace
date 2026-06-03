#!/bin/bash
# EC2에서 실행: init.json 없을 때 즉시 생성 (404 해결)
set -euo pipefail

DEST="/var/www/runrace/__/firebase/init.json"
API_KEY="${FIREBASE_API_KEY:-AIzaSyAdQn5v1Rkp46ycQ8v_jt1JVKBWJN-2Dt4}"
AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN:-runrace-3c8fc.firebaseapp.com}"
PROJECT_ID="${FIREBASE_PROJECT_ID:-runrace-3c8fc}"
APP_ID="${FIREBASE_APP_ID:-1:264137799530:web:02e5f002c68bcbaf4d9713}"

sudo mkdir -p "$(dirname "$DEST")"
sudo tee "$DEST" >/dev/null <<EOF
{
  "apiKey": "$API_KEY",
  "authDomain": "$AUTH_DOMAIN",
  "projectId": "$PROJECT_ID",
  "appId": "$APP_ID"
}
EOF
sudo chmod 644 "$DEST"

echo "Created $DEST"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1/__/firebase/init.json"
ls -la "$DEST"
