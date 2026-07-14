import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1688 상품 이미지는 외부 도메인 → 필요시 remotePatterns 확장
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.1688.com" },
      { protocol: "https", hostname: "**.alicdn.com" },
    ],
  },
};

export default nextConfig;
