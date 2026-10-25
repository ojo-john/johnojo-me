import { ImageResponse } from "next/og";
import { getSite } from "@/lib/content/load";

// Site-wide share card (LinkedIn, iMessage, Slack…), written to /og.png at build time. A route rather
// than opengraph-image.tsx so the exported file keeps its .png extension and is served as an image.
export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

export function GET() {
  const site = getSite();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#F1F0EB", color: "#121417" }}>
        <div style={{ display: "flex", gap: 14 }}>
          {["#2541B2", "#2B2F36", "#4F6B26"].map((c) => (
            <div key={c} style={{ width: 120, height: 14, background: c, borderRadius: 7 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }}>{site.name}</div>
          <div style={{ fontSize: 40, marginTop: 24, color: "#3a3f46" }}>{`${site.role} at ${site.company}`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#3a3f46" }}>
          <span>Work · Travel</span>
          <span style={{ color: "#2541B2", fontWeight: 700 }}>{site.domain}</span>
        </div>
      </div>
    ),
    size,
  );
}
