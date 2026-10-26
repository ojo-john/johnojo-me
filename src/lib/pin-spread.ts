/**
 * Fans out map pins that would sit on top of each other (Bruges, Ghent and Brussels are minutes apart),
 * the way map apps do: each crowded pin moves onto a small circle around its group's centre, and the map
 * draws a thin line back to the true spot. Pins with room keep their exact position.
 */
export interface Pin {
  id: string;
  x: number;
  y: number;
}
export interface PlacedPin extends Pin {
  /** Where the pin is drawn; equals x/y unless it was moved out of a crowd. */
  px: number;
  py: number;
  moved: boolean;
}

export function spreadPins(pins: Pin[], minDistance: number): PlacedPin[] {
  // Group pins closer than minDistance to any other member (single-link clustering).
  const parent = pins.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pins.length; i++)
    for (let j = i + 1; j < pins.length; j++) if (Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y) < minDistance) parent[find(i)] = find(j);

  const groups = new Map<number, number[]>();
  pins.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const out: PlacedPin[] = pins.map((p) => ({ ...p, px: p.x, py: p.y, moved: false }));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const cx = members.reduce((s, i) => s + pins[i].x, 0) / members.length;
    const cy = members.reduce((s, i) => s + pins[i].y, 0) / members.length;
    // Big enough that neighbours on the circle are minDistance apart.
    const radius = Math.max(minDistance * 0.75, minDistance / (2 * Math.sin(Math.PI / members.length)));
    // Keep each pin roughly on its own side of the group, then space them evenly from there.
    const byAngle = [...members].sort((a, b) => Math.atan2(pins[a].y - cy, pins[a].x - cx) - Math.atan2(pins[b].y - cy, pins[b].x - cx));
    const start = Math.atan2(pins[byAngle[0]].y - cy, pins[byAngle[0]].x - cx);
    byAngle.forEach((i, k) => {
      const a = start + (k * 2 * Math.PI) / members.length;
      out[i] = { ...pins[i], px: cx + radius * Math.cos(a), py: cy + radius * Math.sin(a), moved: true };
    });
  }
  return out;
}
