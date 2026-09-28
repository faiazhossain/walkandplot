/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, Route, type RouteMatchCallbackOptions } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// PRD 33: the whole app is static, so precaching the shell makes every
// screen available offline after first load. Static export emits the page
// HTML *after* the Serwist manifest is compiled, so the documents are added
// here explicitly and a navigation handler maps clean URLs onto them
// (same rule as the static host: /projects/map -> /projects/map.html).

// Known routes (PRD 26 + static-export query-param deviation). Keep in sync
// with app/.
const APP_PAGES = [
  "/index.html",
  "/settings.html",
  "/projects/new.html",
  "/projects/view.html",
  "/projects/map.html",
  "/404.html",
];

// Static-export client navigation fetches these RSC payloads; without them
// a Link click cannot complete offline.
const RSC_PAYLOADS = [
  "/index.txt",
  "/settings.txt",
  "/projects/new.txt",
  "/projects/view.txt",
  "/projects/map.txt",
  "/_not-found.txt",
];

// The manifest lists hashed asset names, so it changes on every build; fold
// a fingerprint of it into the document revisions so rebuilt HTML is
// re-precached instead of served stale. (Only ONE reference to
// __SW_MANIFEST is allowed - the webpack plugin replaces it literally.)
const manifest: (PrecacheEntry | string)[] = self.__SW_MANIFEST ?? [];
const manifestFingerprint = String(
  manifest.reduce((acc: number, entry) => {
    const url = typeof entry === "string" ? entry : entry.url;
    return acc + url.length + url.slice(-8).length;
  }, 0),
);

const documents = [...APP_PAGES, ...RSC_PAYLOADS].map((url) => ({
  url,
  revision: manifestFingerprint,
}));

const serwist = new Serwist({
  precacheEntries: [...manifest, ...documents],
  // Next's client router fetches payloads with a ?_rsc query; ignoring every
  // search param lets those requests hit their precached .txt directly.
  precacheOptions: { ignoreURLParametersMatching: [/^./] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false, // navigations are served cache-first offline (P6)
  runtimeCaching: defaultCache,
});

// Clean-URL navigation: /projects/map -> /projects/map.html, else the shell.
serwist.registerRoute(
  new Route(
    ({ request }: RouteMatchCallbackOptions) => request.mode === "navigate",
    async ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const candidates = [
        pathname,
        pathname.endsWith("/") ? `${pathname}index.html` : `${pathname}.html`,
        "/index.html",
      ];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const candidate of candidates) {
          const hit = await cache.match(candidate);
          if (hit) return hit;
        }
      }
      // Online fallback (first visit of a not-yet-cached route).
      return fetch(request);
    },
  ),
);

serwist.addEventListeners();
