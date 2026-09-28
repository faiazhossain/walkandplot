"use client";

import { useEffect, useRef } from "react";
import type { GeoAnchor } from "@/lib/domain/geo";

// Optional basemap under the plotting canvas (owner-amended PRD non-goal):
// MapLibre renders the Barikoi planet style; the app stays fully usable
// without it (offline falls back to the grid). Loaded via dynamic import so
// the mapping route bundle only pays for it when the layer is switched on
// (PRD 36 budget).

export const BARIKOI_STYLE_URL =
  "https://map.barikoi.com/styles/planet_map/style.json?key=MjY0NDpHRUswODE3R1VV";

export interface BasemapBridge {
  setView: (lng: number, lat: number, zoom: number) => void;
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  onViewChange: (cb: () => void) => void;
  dispose: () => void;
}

export function useBasemap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  anchor: GeoAnchor,
  onExternalChange: () => void,
) {
  const bridgeRef = useRef<BasemapBridge | null>(null);
  const externalCb = useRef(onExternalChange);
  externalCb.current = onExternalChange;

  useEffect(() => {
    if (!enabled) {
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      return;
    }
    if (!containerRef.current || bridgeRef.current) return;

    let map: import("maplibre-gl").Map | null = null;
    let disposed = false;
    let importError = false;

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (disposed || !containerRef.current) return;
        const m = new maplibre.Map({
          container: containerRef.current,
          style: BARIKOI_STYLE_URL,
          center: [anchor.lng, anchor.lat],
          zoom: 18,
          attributionControl: { compact: true },
        });
        m.on("error", (e) => {
          // Offline or bad key: the canvas keeps working on the grid (PRD 32).
          console.warn("Basemap error (continuing without tiles)", e.error?.message ?? e);
        });
        const fire = () => externalCb.current();
        m.on("move", fire);
        m.on("zoom", fire);
        map = m;

        bridgeRef.current = {
          setView: (lng, lat, zoom) => {
            m.jumpTo({ center: [lng, lat], zoom });
          },
          getCenter: () => ({ lng: m.getCenter().lng, lat: m.getCenter().lat }),
          getZoom: () => m.getZoom(),
          onViewChange: (cb) => {
            externalCb.current = cb;
          },
          dispose: () => {
            m.remove();
            map = null;
          },
        };
      } catch (err) {
        importError = true;
        console.error("Basemap could not load", err);
      }
      if (disposed && map) {
        map.remove();
        map = null;
      }
      void importError;
    })();

    return () => {
      disposed = true;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    };
    // anchor intentionally excluded: live anchor changes flow through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, containerRef]);

  return bridgeRef;
}
