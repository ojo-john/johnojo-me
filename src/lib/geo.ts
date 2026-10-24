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
    points: located.map((p) => {
      const [x, y] = projection([p.lng as number, p.lat as number]) ?? [0, 0];
      return { id: p.id, label: p.label, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }),
  };
}
