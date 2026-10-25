import "server-only";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import world from "world-atlas/countries-50m.json";

/**
 * Build-time map geometry. Countries come from Natural Earth (public domain) via world-atlas and are
 * projected and clipped here, so the browser receives a single pre-drawn SVG path and no map library.
 */

export interface MapPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Where to draw the label so close neighbours (Bruges, Ghent, Brussels) don't overlap. */
  labelSide: "right" | "left" | "below" | "above";
}

/** Greedy placement: try right, left, below, above; take the first spot clear of labels already placed. */
function placeLabels(points: Omit<MapPoint, "labelSide">[]): MapPoint[] {
  // Every dot is an obstacle, so a label never sits on top of a neighbouring pin.
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = points.map((p) => ({ x0: p.x - 7, y0: p.y - 7, x1: p.x + 7, y1: p.y + 7 }));
  const box = (p: { x: number; y: number; label: string }, side: MapPoint["labelSide"]) => {
    const w = p.label.length * 8 + 10, h = 18;
    if (side === "right") return { x0: p.x + 8, y0: p.y - h / 2, x1: p.x + 8 + w, y1: p.y + h / 2 };
    if (side === "left") return { x0: p.x - 8 - w, y0: p.y - h / 2, x1: p.x - 8, y1: p.y + h / 2 };
    if (side === "below") return { x0: p.x - w / 2, y0: p.y + 8, x1: p.x + w / 2, y1: p.y + 8 + h };
    return { x0: p.x - w / 2, y0: p.y - 8 - h, x1: p.x + w / 2, y1: p.y - 8 };
  };
  const overlap = (b: (typeof boxes)[number]) =>
    boxes.reduce((sum, o) => sum + Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0)), 0);
  return [...points]
    .sort((a, b) => a.y - b.y)
    .map((p) => {
      // First side with no overlap; failing that, the side that overlaps least.
      const sides = ["right", "left", "below", "above"] as const;
      const side = sides.map((sd) => ({ sd, o: overlap(box(p, sd)) })).sort((x, y) => x.o - y.o || sides.indexOf(x.sd) - sides.indexOf(y.sd))[0].sd;
      boxes.push(box(p, side));
      return { ...p, labelSide: side };
    });
}
export interface MapGeometry {
  width: number;
  height: number;
  land: string;
  points: MapPoint[];
}

const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topology, topology.objects.countries) as FeatureCollection;

/** Frame the given coordinates with padding, so every trip gets a map centred on where it went. */
export function mapFor(places: { id: string; label: string; lat?: number; lng?: number }[], width = 800, height = 800, pad = 0.18): MapGeometry {
  const located = places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  // Fall back to a Europe-wide frame when there are fewer than two pins to fit around.
  const frame = located.length >= 2 ? located : [{ lat: 36, lng: -10 }, { lat: 58, lng: 20 }];
  const lngs = frame.map((p) => p.lng as number);
  const lats = frame.map((p) => p.lat as number);
  const spanLng = Math.max(...lngs) - Math.min(...lngs) || 4;
  const spanLat = Math.max(...lats) - Math.min(...lats) || 3;
  const bbox = {
    type: "MultiPoint" as const,
    coordinates: [
      [Math.min(...lngs) - spanLng * pad - 1, Math.min(...lats) - spanLat * pad - 1],
      [Math.max(...lngs) + spanLng * pad + 1, Math.max(...lats) + spanLat * pad + 1],
    ],
  };
  const projection = geoMercator().fitExtent([[0, 0], [width, height]], bbox).clipExtent([[0, 0], [width, height]]);
  const path = geoPath(projection).digits(1);
  return {
    width,
    height,
    land: path(countries) ?? "",
    points: placeLabels(
      located.map((p) => {
        const [x, y] = projection([p.lng as number, p.lat as number]) ?? [0, 0];
        return { id: p.id, label: p.label, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      }),
    ),
  };
}
