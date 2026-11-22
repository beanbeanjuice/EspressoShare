import type { NextConfig } from "next";

import { version } from "./package.json";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  reactStrictMode: false,
  output: 'standalone',
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/v/:id", destination: "/watch/:id", permanent: true },
      { source: "/w/:id", destination: "/watch/:id", permanent: true },
    ];
  },
  env: {
    NEXT_PUBLIC_WEBSITE_VERSION: version
  },
  serverExternalPackages: ["@mediabunny/server", "mediabunny"],
};

export default nextConfig;
