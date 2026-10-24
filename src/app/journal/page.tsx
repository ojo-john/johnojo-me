import type { Metadata } from "next";
import { JournalIndex } from "@/components/journal/JournalIndex";
import { getPosts } from "@/lib/content/load";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Journal",
  description: "Bible studies, faith, life lessons, essays and engineering notes.",
  alternates: { canonical: "/journal/" },
};

const CATEGORIES = ["Bible Study", "Faith", "Life Lessons", "Essays", "Engineering", "Travel Reflections"];

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
        categories={CATEGORIES}
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
