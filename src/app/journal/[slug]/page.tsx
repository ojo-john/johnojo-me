import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reader } from "@/components/journal/Reader";
import { getPost, getPosts, getSite } from "@/lib/content/load";
import { formatDate } from "@/lib/format";
import { headingsOf, renderPost, scriptureKeysOf } from "@/lib/mdx";
import { passage, passageUrl } from "@/lib/scripture";

export const dynamicParams = false;

export function generateStaticParams() {
  const posts = getPosts().map((p) => ({ slug: p.slug }));
  // A static export needs at least one path; until the first post is published, emit a placeholder.
  return posts.length ? posts : [{ slug: "coming-soon" }];
}

export async function generateMetadata({ params }: PageProps<"/journal/[slug]">): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { robots: { index: false, follow: false } };
  const meta = pageMeta({ title: post.title, description: post.dek, path: `/journal/${post.slug}/` });
  return { ...meta, openGraph: { ...meta.openGraph, type: "article", publishedTime: post.publishedAt, modifiedTime: post.updatedAt } };
}

export default async function PostPage({ params }: PageProps<"/journal/[slug]">) {
  const slug = (await params).slug;
  const post = getPost(slug);
  if (!post && slug === "coming-soon")
    return (
      <section className="wrap" style={{ paddingBlock: "96px 120px" }}>
        <h1 style={{ fontSize: "clamp(44px,6vw,80px)" }}>First posts coming soon</h1>
        <Link className="btn" href="/journal/" style={{ marginTop: 24 }}>
          ← Journal
        </Link>
      </section>
    );
  if (!post) notFound();
  const site = getSite();
  const content = await renderPost(post.body);
  const passages = scriptureKeysOf(post.body).map((k) => ({ key: k, ...passage(k), url: passageUrl(k) }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.dek,
    author: { "@type": "Person", name: site.name },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
  };
  return (
    <article>
      <JsonLd data={jsonLd} />
      <header className="wrap ahead">
        <div>
          {post.status === "draft" ? <span className="flag">{post.sample ? "Sample · draft, not public" : "Draft · not public"}</span> : null}
          <p className="kicker" style={{ color: "var(--journal)", marginTop: 16 }}>
            <Link href="/journal/" style={{ textDecoration: "none" }}>
              03 · Journal
            </Link>{" "}
            · {post.category}
            {post.series ? ` · ${post.series}` : ""}
          </p>
          <h1 style={{ marginTop: 10 }}>{post.title}</h1>
          <p className="dek">{post.dek}</p>
          <div className="pills">
            <span>{site.name}</span>
            {post.publishedAt ? <span>{formatDate(post.publishedAt)}</span> : null}
            {post.updatedAt ? <span>Updated {formatDate(post.updatedAt)}</span> : null}
            <span>{post.minutes} min read</span>
            {passages.length ? <span>Scripture: WEB</span> : null}
          </div>
        </div>
      </header>
      <Reader headings={headingsOf(post.body)} passages={passages} footnotes={post.footnotes} minutes={post.minutes}>
        {content}
        {post.questions.length ? (
          <section className="card qs" aria-labelledby="qh">
            <h2 id="qh">Study questions</h2>
            <ol>
              {post.questions.map((q, i) => (
                <li key={q}>
                  <label htmlFor={`q${i}`}>{q}</label>
                  <textarea id={`q${i}`} placeholder="Your notes stay on this device and aren't saved." />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {post.footnotes.length ? (
          <section className="notes" aria-labelledby="nh">
            <h2 id="nh" className="kicker" style={{ fontSize: 12, margin: 0 }}>
              Notes
            </h2>
            <ol>
              {post.footnotes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </Reader>
      <div className="wrap" style={{ paddingBlock: "72px 96px" }}>
        <Link className="btn" href="/journal/">
          ← All posts
        </Link>
      </div>
    </article>
  );
}
