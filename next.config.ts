import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// PRD 27/33: fully static export; Serwist precaches the app shell so the
// installed PWA works offline after first load. Builds run on webpack
// (`next build --webpack`) because @serwist/next compiles the service worker
// through its webpack plugin; dev stays on the Next 16 default (Turbopack)
// with the SW disabled. Revisit when Serwist gains Turbopack support.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "export",
  // withSerwistInit attaches a webpack config even when disabled, and
  // Next 16 hard-errors on Turbopack dev when a webpack config exists
  // with no turbopack config. The empty config acknowledges it: dev
  // ignores the webpack key, which is a no-op here anyway.
  turbopack: {},
};

export default withSerwist(nextConfig);
