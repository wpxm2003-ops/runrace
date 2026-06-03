# Firebase Console > Android 앱 > SHA-1 등록용
$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  Write-Error "keytool not found. Install JDK or Android Studio."
  exit 1
}
$store = Join-Path $env:USERPROFILE ".android\debug.keystore"
if (-not (Test-Path $store)) {
  Write-Error "Debug keystore not found: $store"
  exit 1
}
& keytool -list -v -keystore $store -alias androiddebugkey -storepass android -keypass android
