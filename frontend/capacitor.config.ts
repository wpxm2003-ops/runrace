import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.runrace.app',
  appName: 'RunRace',
  webDir: 'out',
  server: {
    cleartext: true,
    // https://localhost → http API 호출이 막힘(mixed content). http 스킴 사용
    androidScheme: 'http',
  },
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
