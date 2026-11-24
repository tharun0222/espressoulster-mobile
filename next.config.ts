import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next-selfhost',
  poweredByHeader: false,
  devIndicators: false,
  webpack(config, { webpack }) {
    // Vite's map worker ?url import must remain a URL under webpack as well;
    // executing a worker module during server rendering references `self`.
    config.module.rules.push({ resourceQuery: /(?:^|[?&])url(?:&|$)/, type: 'asset/resource' });
    // The ordinary Next.js build runs on our own Node server. The existing
    // local Vite preview retains its worker binding until explicitly replaced.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "server/runtime.mjs"),
    ));
    return config;
  },
};

export default nextConfig;
