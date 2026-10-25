import Link from "next/link";
import type { Site } from "@/lib/content/schema";

export function Footer({ site, journal }: { site: Site; journal: boolean }) {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div>
          <h2>{journal ? "Work. Travel. Journal." : "Work. Travel."}</h2>
          <p style={{ marginTop: 12, opacity: 0.7 }}>© {new Date().getFullYear()} {site.name}</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/work/">Work</Link>
          <Link href="/travel/">Travel</Link>
          {journal ? <Link href="/journal/">Journal</Link> : null}
          <a href={site.github} target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
          {site.linkedin ? (
            <a href={site.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn ↗
            </a>
          ) : null}
          {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}
        </nav>
      </div>
    </footer>
  );
}
