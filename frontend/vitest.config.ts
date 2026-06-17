import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 순수 로직(lib) 유닛 테스트용 설정. 컴포넌트 렌더링은 대상이 아니므로 node 환경 사용.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
