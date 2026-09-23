import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Carbon ships one large barrel file; only bundle what we import.
    optimizePackageImports: ["@carbon/react", "@carbon/icons-react"],
  },
  sassOptions: {
    // Carbon's Sass still triggers these Dart Sass deprecation warnings.
    silenceDeprecations: ["legacy-js-api", "import", "global-builtin"],
  },
  async redirects() {
    // The standalone board is gone; the roadmap is the front door.
    return [
      { source: "/boards", destination: "/roadmap", permanent: false },
      { source: "/boards/:path*", destination: "/roadmap", permanent: false },
    ];
  },
};

export default nextConfig;
