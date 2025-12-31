import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Use webpack instead of turbopack for build
  experimental: {
    // Disable global-error page for static export
  },
};

export default nextConfig;
