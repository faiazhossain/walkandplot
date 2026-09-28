import type { MetadataRoute } from "next";

// PRD 33: installable PWA, standalone mode, offline-capable.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Walk & Plot",
    short_name: "Walk & Plot",
    description: "Map any building with just your phone. No account needed. Works offline.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F6F3",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
