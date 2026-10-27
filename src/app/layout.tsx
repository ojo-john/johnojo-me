import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, Figtree, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";
import { Header, type JumpItem } from "@/components/Header";
import { Metrics } from "@/components/Metrics";
import { Reveal } from "@/components/Reveal";
import { getPosts, getSite, getTrips, journalIsOpen } from "@/lib/content/load";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
// Reading and mono faces are never needed for the first paint, so they aren't preloaded.
const read = Source_Serif_4({ subsets: ["latin"], variable: "--font-read", style: ["normal", "italic"], display: "swap", preload: false });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });

const site = getSite();
const journal = journalIsOpen();

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: { default: `${site.name} · ${journal ? "Work, Travel, Journal" : "Software Engineer, Work and Travel"}`, template: `%s · ${site.name}` },
  description: site.seoDescription ?? site.intro,
  // Feed readers and browsers find the journal feed from any page, once the journal is public.
  alternates: { canonical: "/", ...(journal ? { types: { "application/rss+xml": [{ url: "/journal/feed.xml", title: `${site.name} · Journal` }] } } : {}) },
  openGraph: { type: "website", siteName: site.name, url: "/", locale: "en_US", images: [{ url: "/og.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#f1f0eb" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Quick-jump index for the "Jump to" palette, built at compile time from content.
  const jump: JumpItem[] = [
    { label: "Work", hint: "Page", href: "/work/" },
    { label: "Career timeline", hint: "Work", href: "/work/#career" },
    { label: "Skills and projects", hint: "Work", href: "/work/#skills" },
    { label: "Travel", hint: "Page", href: "/travel/" },
    { label: "Match days", hint: "Travel", href: "/travel/match-days/" },
    ...getTrips().flatMap((t) => [
      { label: t.title, hint: "Trip", href: `/travel/${t.slug}/` },
      ...t.visits.map((v) => ({ label: `${v.place.city} · ${t.year}`, hint: "City", href: `/travel/${t.slug}/#${v.slug}` })),
    ]),
    ...(journal ? [{ label: "Journal", hint: "Page", href: "/journal/" }] : []),
    ...getPosts().map((p) => ({ label: p.title, hint: p.category, href: `/journal/${p.slug}/` })),
  ];
  return (
    // suppressHydrationWarning: the dev server can hash next/font class names differently on the server
    // and in the browser. It only silences attribute mismatches on <html>; the static build has none.
    <html lang="en" className={`${display.variable} ${ui.variable} ${read.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Marks JS as available before first paint so reveal animations never hide content without it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Header site={{ name: site.name, github: site.github, resume: site.resume, linkedin: site.linkedin, role: site.role, company: site.company }} jump={jump} journal={journal} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer site={site} journal={journal} />
        <Reveal />
        <Analytics />
        {/* Own page-view and click counts (docs/METRICS.md). Off unless the build sets NEXT_PUBLIC_METRICS=1. */}
        {process.env.NEXT_PUBLIC_METRICS === "1" ? <Metrics /> : null}
      </body>
    </html>
  );
}
