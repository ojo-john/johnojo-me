"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/metrics/track";
import { ThemeToggle } from "./ThemeToggle";

export interface JumpItem {
  label: string;
  hint: string;
  href: string;
  external?: boolean;
}

interface HeaderSite {
  name: string;
  github: string;
  resume: string | null;
  linkedin: string | null;
  role: string;
  company: string;
}

const TABS = [
  { href: "/work/", label: "Work", color: "var(--work)" },
  { href: "/travel/", label: "Travel", color: "var(--travel)" },
  { href: "/journal/", label: "Journal", color: "var(--journal)" },
];

/** The site's single navigation bar: name, pillar tabs, Jump-to search, GitHub and résumé. */
export function Header({ site, jump, journal }: { site: HeaderSite; jump: JumpItem[]; journal: boolean }) {
  const pathname = usePathname();
  const tabs = journal ? TABS : TABS.filter((t) => t.href !== "/journal/");
  const active = TABS.find((t) => pathname.startsWith(t.href));
  const [palOpen, setPalOpen] = useState(false);
  const cvRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Tints the logo's square: the section's colour, or the brand cobalt on pages outside a section.
    document.documentElement.style.setProperty("--pillar", active?.color ?? "var(--work)");
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setPalOpen(true);
      }
    };
    const onCv = () => cvRef.current?.showModal();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-resume", onCv);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-resume", onCv);
    };
  }, []);

  const items = useMemo<JumpItem[]>(
    () => [{ label: "View résumé", hint: "Work", href: "#resume" }, { label: "GitHub profile", hint: "Link", href: site.github, external: true }, ...jump],
    [jump, site.github],
  );

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <Link className="logo" href="/">
            {/* The "Jo" mark from the favicon; its square takes the colour of the section you're in. */}
            <svg className="mark" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="14" />
              <path d="M26 15 V37 A6 6 0 0 1 14 37" fill="none" stroke="var(--on-fill)" strokeWidth="6.5" strokeLinecap="round" />
              <circle cx="43" cy="34" r="9.5" fill="none" stroke="var(--on-fill)" strokeWidth="6.5" />
              <circle cx="52" cy="12" r="4.5" fill="var(--sun)" />
            </svg>
            {site.name}
          </Link>
          <nav className="tnav" aria-label="Main">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href} style={{ ["--c" as string]: t.color }} aria-current={active?.href === t.href ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="top-r">
            <ThemeToggle />
            <button className="find" type="button" data-track="jump to: open" onClick={() => setPalOpen(true)} aria-label="Search and jump to (press slash)">
              <span className="ico" aria-hidden="true">
                ⌕
              </span>
              <span className="t">Jump to</span>
              <kbd>/</kbd>
            </button>
            <a className="btn gh" href={site.github} target="_blank" rel="noopener noreferrer">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <button className="btn fill" type="button" data-track="résumé: open" onClick={() => cvRef.current?.showModal()}>
              Résumé
            </button>
          </div>
        </div>
      </header>
      <ResumeDialog ref={cvRef} site={site} />
      <Palette open={palOpen} onClose={() => setPalOpen(false)} items={items} onResume={() => cvRef.current?.showModal()} />
    </>
  );
}

function ResumeDialog({ ref, site }: { ref: React.Ref<HTMLDialogElement>; site: HeaderSite }) {
  return (
    <dialog ref={ref} className="cv-dlg" aria-labelledby="cv-title" onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="cv-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id="cv-title" style={{ fontSize: 28 }}>
            Résumé
          </h2>
          <form method="dialog">
            <button className="btn" type="submit">
              Close
            </button>
          </form>
        </div>
        <div className="card" style={{ background: "var(--chalk)", padding: 28 }}>
          <h3 style={{ fontSize: 34 }}>{site.name}</h3>
          <p className="mono" style={{ marginTop: 6 }}>
            {site.role} · {site.company}
          </p>
          <p style={{ marginTop: 10, color: "var(--ink-2)" }}>Experience, technical skills and education on one page.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a className="btn fill" href="/resume/">
            Open résumé
          </a>
          {site.resume ? (
            <a className="btn" href={site.resume} download>
              Download PDF
            </a>
          ) : null}
          {site.linkedin ? (
            <a className="btn" href={site.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          <a className="btn" href={site.github} target="_blank" rel="noopener noreferrer">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </dialog>
  );
}

function Palette({ open, onClose, items, onResume }: { open: boolean; onClose: () => void; items: JumpItem[]; onResume: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setSel(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const run = useCallback(
    (item: JumpItem | undefined) => {
      if (!item) return;
      // Counted here rather than on click, so choosing with Enter counts too. The typed query never is.
      track(`jump to: ${item.hint} · ${item.label}`);
      onClose();
      if (item.href === "#resume") return onResume();
      if (item.external) return window.open(item.href, "_blank", "noopener");
      router.push(item.href);
    },
    [onClose, onResume, router],
  );

  return (
    <dialog ref={ref} className="pal" aria-label="Jump to" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <label className="sr-only" htmlFor="pal-q">
        Search pages, trips, cities and posts
      </label>
      <input
        id="pal-q"
        type="text"
        autoComplete="off"
        placeholder="Jump to… try “résumé”, “Porto” or “Chelsea”"
        role="combobox"
        aria-expanded="true"
        aria-controls="pal-list"
        aria-activedescendant={results.length ? `po-${sel}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => (s + 1) % Math.max(1, results.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => (s - 1 + results.length) % Math.max(1, results.length));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(results[sel]);
          }
        }}
      />
      <ul id="pal-list" role="listbox">
        {results.length ? (
          results.slice(0, 40).map((r, i) => (
            <li key={r.href + r.label} id={`po-${i}`} role="option" aria-selected={i === sel} onClick={() => run(r)} onMouseEnter={() => setSel(i)}>
              {r.label}
              {r.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
              <span>{r.hint}</span>
            </li>
          ))
        ) : (
          <li role="presentation">No matches</li>
        )}
      </ul>
      <div className="hint">↑ ↓ to move · Enter to open · Esc to close</div>
    </dialog>
  );
}
