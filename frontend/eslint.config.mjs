import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React 19 신규 강성 규칙 — 기존의 의도된 패턴(SSR-safe localStorage 하이드레이션,
    // 라우트 변경 시 상태 리셋, 카운트다운 타이머 등)을 잡는다. 무리한 리팩터링은 동작
    // 깨질 위험이 커서 빌드 차단(error) 대신 warn으로 두고 점진적으로 개선한다.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
