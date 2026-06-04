import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production"
    ? { output: "export" as const }
    : {}),
  images: { unoptimized: true },
  // 로컬 dev: EC2 Nginx와 같이 /api → 백엔드 프록시 (브라우저 CORS 회피)
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8081/api/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
