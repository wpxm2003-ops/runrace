import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(isProd
    ? {
        output: "export" as const,
      }
    : {
        // 로컬 dev: EC2 Nginx와 같이 /api → 백엔드 프록시 (브라우저 CORS 회피)
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:8081/api/:path*",
            },
          ];
        },
      }),
  images: { unoptimized: true },
};

export default nextConfig;
