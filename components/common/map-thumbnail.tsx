import type { Feature } from "@/lib/domain/schema";

// Miniature floor preview for project and floor rows, like the prototype's
// static map thumbs. Pure math over local floor coordinates; aspect is
// always square so rows stay aligned.

export interface ThumbnailGeometry {
  /** SVG path `d` strings in a 0-100 viewBox. */
  paths: string[];
}

export function thumbnailGeometry(features: Pick<Feature, "geometry">[]): ThumbnailGeometry | null {
  const coords: [number, number][] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === "Point") coords.push(g.coordinates);
    else if (g.type === "LineString") coords.push(...g.coordinates);
    else for (const ring of g.coordinates) coords.push(...ring);
  }
  if (!coords.length) return null;

  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Guard against a zero-extent floor (single tap) so scaling stays finite.
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const span = Math.max(spanX, spanY);
  const pad = span * 0.12;
  const scale = 100 / (span + pad * 2);
  const offX = minX - pad + (span - spanX) / 2;
  const offY = minY - pad + (span - spanY) / 2;

  const toXY = (c: [number, number]) =>
    `${((c[0] - offX) * scale).toFixed(1)},${((c[1] - offY) * scale).toFixed(1)}`;

  const paths: string[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === "Point") {
      const [x, y] = toXY(g.coordinates).split(",");
      paths.push(`M ${Number(x) - 4} ${y} a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0`);
    } else if (g.type === "LineString") {
      paths.push(`M ${g.coordinates.map(toXY).join(" L ")}`);
    } else {
      for (const ring of g.coordinates) {
        paths.push(`M ${ring.map(toXY).join(" L ")} Z`);
      }
    }
  }
  return { paths };
}

export function MapThumbnail({ features, className }: { features: Feature[]; className?: string }) {
  const geom = thumbnailGeometry(features);
  if (!geom) return null;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {geom.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      ))}
    </svg>
  );
}
