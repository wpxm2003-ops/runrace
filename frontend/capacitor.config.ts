import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { CapacitorConfig } from '@capacitor/cli';

function loadCapacitorEnv() {
  const envPath = resolve(__dirname, 'capacitor.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadCapacitorEnv();

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const server: CapacitorConfig['server'] = serverUrl
  ? {
      url: serverUrl,
      cleartext: serverUrl.startsWith('http://'),
      androidScheme: serverUrl.startsWith('https://') ? 'https' : 'http',
    }
  : {
      cleartext: true,
      // https://localhost → http API 호출이 막힘(mixed content). http 스킴 사용
      androidScheme: 'http',
    };

if (serverUrl) {
  console.log('[capacitor] Remote web URL:', serverUrl);
}

const config: CapacitorConfig = {
  appId: 'com.runrace.app',
  appName: 'RunRace',
  webDir: 'out',
  server,
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
