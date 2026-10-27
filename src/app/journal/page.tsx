import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { JournalIndex } from "@/components/journal/JournalIndex";
import { getPosts, journalIsOpen } from "@/lib/content/load";
import { usedCategories } from "@/lib/content/post-categories";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  ...pageMeta({ title: "Journal", description: "Bible studies, faith, life lessons, essays and engineering notes.", path: "/journal/" }),
  // Built but unlinked and kept out of search until the first post is public.
  ...(journalIsOpen() ? {} : { robots: { index: false, follow: false } }),
};

export default function JournalPage() {
  const posts = getPosts();
  return (
    <>
      <header className="band" style={{ ["--pillar" as string]: "var(--journal)" }}>
        <div className="wrap">
          <span className="kicker" style={{ opacity: 0.85 }}>
            03 · Journal
          </span>
          <h1 style={{ marginTop: 10 }}>What I&apos;m learning</h1>
          <p className="lede">Bible studies, faith, life lessons, essays and engineering notes.</p>
        </div>
      </header>
      <JournalIndex
        categories={usedCategories(posts)}
        posts={posts.map((p) => ({
          slug: p.slug,
          title: p.title,
          dek: p.dek,
          category: p.category,
          tags: p.tags,
          date: formatDate(p.publishedAt),
          minutes: p.minutes,
          status: p.status,
          sample: p.sample,
        }))}
      />
    </>
  );
}
