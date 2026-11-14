import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The compile route shells out to Tectonic when it is available locally.
  serverExternalPackages: [],
};

export default nextConfig;
