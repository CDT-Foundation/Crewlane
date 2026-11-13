import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image.
  output: "standalone",
  poweredByHeader: false,
  // postgres.js and prom-client are plain Node libraries; keep them external.
  serverExternalPackages: ["postgres", "prom-client"],
  // Invoice and document uploads go through server actions (15 MB max).
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
