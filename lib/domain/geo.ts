// PRD 22 reserved room for "geographic calibration via anchors": a floor's
// local coordinate origin (0,0) maps to a real-world position. The basemap
// feature uses this to place the floor under the plotting canvas. Pure math;
// spherical Earth is accurate enough for floor-scale extents.

const EARTH_RADIUS_M = 6_378_137;
const DEG = 180 / Math.PI;

export interface GeoAnchor {
  lat: number;
  lng: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}

/** Local floor meters -> longitude/latitude (x east, y south, north up). */
export function localToLngLat(anchor: GeoAnchor, p: { x: number; y: number }): LngLat {
  const lat = anchor.lat - (p.y / EARTH_RADIUS_M) * DEG;
  const metersPerDegLng = Math.max(1, Math.cos((anchor.lat * Math.PI) / 180) * EARTH_RADIUS_M * DEG);
  const lng = anchor.lng + p.x / metersPerDegLng;
  return { lng, lat };
}

/** Longitude/latitude -> local floor meters (inverse of localToLngLat). */
export function lngLatToLocal(anchor: GeoAnchor, c: LngLat): { x: number; y: number } {
  const y = ((anchor.lat - c.lat) * Math.PI * EARTH_RADIUS_M) / 180;
  const metersPerDegLng = Math.max(1, Math.cos((anchor.lat * Math.PI) / 180) * EARTH_RADIUS_M * DEG);
  const x = (c.lng - anchor.lng) * metersPerDegLng;
  return { x, y };
}

/** Web Mercator ground resolution (meters per pixel) at a latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number, tileSize = 512): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS_M) / (tileSize * 2 ** zoom);
}

/** Konva scale (screen px per floor unit) -> maplibre zoom at the anchor. */
export function scaleToZoom(anchor: GeoAnchor, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 16;
  // floor units are meters once calibrated; uncalibrated floors assume 1u=1m.
  const mpp = 1 / scale;
  return Math.log2((Math.cos((anchor.lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS_M) / (512 * mpp));
}

/** Maplibre zoom -> Konva scale (inverse of scaleToZoom). */
export function zoomToScale(anchor: GeoAnchor, zoom: number): number {
  const mpp = metersPerPixel(anchor.lat, zoom);
  if (mpp <= 0) return 48;
  return 1 / mpp;
}

/** Default anchor: Dhaka (Barikoi's home turf) - overridden by alignment. */
export const DEFAULT_ANCHOR: GeoAnchor = { lat: 23.8103, lng: 90.4125 };
