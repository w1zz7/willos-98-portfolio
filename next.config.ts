import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Silences Next's multi-lockfile warning — there's a package-lock.json in
  // the parent dir (unrelated project). This pins this app's root.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
