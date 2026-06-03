import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production"
    ? { output: "export" as const }
    : {}),
  images: { unoptimized: true },
};

export default nextConfig;
