"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface PostCard {
  slug: string;
  title: string;
  dek: string;
  category: string;
  tags: string[];
  date: string | null;
  minutes: number;
  status: string;
  sample: boolean;
}

/** Search across titles, summaries, categories and tags, plus category filters. Runs in the browser. */
export function JournalIndex({ posts, categories }: { posts: PostCard[]; categories: string[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return posts.filter((p) => (!cat || p.category === cat) && (!s || [p.title, p.dek, p.category, ...p.tags].join(" ").toLowerCase().includes(s)));
  }, [posts, q, cat]);

  return (
    <section className="wrap" style={{ paddingBlock: "32px 96px" }} aria-labelledby="posts-h">
      <h2 id="posts-h" className="sr-only">
        Posts
      </h2>
      <label className="sr-only" htmlFor="j-search">
        Search the Journal
      </label>
      <input className="searchbox" id="j-search" type="search" placeholder="Search posts, tags, books of the Bible…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tags" role="group" aria-label="Categories" style={{ margin: "14px 0 24px", gap: 6 }}>
        {["", ...categories].map((c) => (
          <button key={c || "all"} className="chip" type="button" style={{ ["--pill" as string]: "var(--journal)", ["--pill-fg" as string]: "var(--on-fill)" }} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c || "All"}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <div className="empty-card">
          <h3>First posts coming soon</h3>
          <p style={{ marginTop: 8, color: "var(--ink-2)" }}>Bible studies, reflections, essays and engineering notes will appear here.</p>
        </div>
      ) : list.length ? (
        <ul className="res" aria-live="polite">
          {list.map((p) => (
            <li key={p.slug}>
              <Link className="card" href={`/journal/${p.slug}/`}>
                <span className="k2">
                  {p.category}
                  {p.date ? ` · ${p.date}` : ""} · {p.minutes} min{p.status === "draft" ? (p.sample ? " · sample draft" : " · draft") : ""}
                </span>
                <b>{p.title}</b>
                <span style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{p.dek}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="missing">Nothing matches “{q}”.</p>
      )}
    </section>
  );
}
