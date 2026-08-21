import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  redirects: async () => [
    { source: "/", destination: "/dashboard", permanent: false },
  ],
};

export default nextConfig;
