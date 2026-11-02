import "server-only";
import { Picture } from "@/components/Picture";
import { getMediaManifest } from "@/lib/content/load";
import type { MediaItem } from "@/lib/content/media";

/**
 * Building blocks for city guides and other practical posts, used from a post's MDX:
 * <Glance>, <Photo>, <Days>/<Day>, <Picks>/<Pick> and <Budget>. Server components: photos come from the
 * media manifest at build time, so a post never ships a photo the site doesn't have.
 */

/** Key facts in a row of tiles at the top of a guide. */
export function Glance({ facts }: { facts: [label: string, value: string][] }) {
  return (
    <dl className="glance">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One photo from the media manifest, by id ("europe-2026/milan/photos/img-0995"). */
export function Photo({ id, caption, alt, wide = false }: { id: string; caption?: string; alt: string; wide?: boolean }) {
  const entry = getMediaManifest().items[id];
  // A wrong id is the author's mistake: fail the build rather than publish a gap.
  if (!entry || entry.type !== "photo") throw new Error(`<Photo id="${id}"> is not a photo in content/media-manifest.json`);
  const photo: MediaItem = { ...entry, id, caption: caption ?? null, alt };
  return (
    <figure className={`g-photo${wide ? " wide" : ""}`}>
      <Picture photo={photo} sizes="(max-width: 760px) 100vw, 640px" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Photos side by side (two or three). */
export function Photos({ children }: { children: React.ReactNode }) {
  return <div className="g-photos">{children}</div>;
}

/** A day-by-day plan, drawn as a timeline. */
export function Days({ children }: { children: React.ReactNode }) {
  return <ol className="days">{children}</ol>;
}

export function Day({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li>
      <span className="days-n">Day {n}</span>
      <b>{title}</b>
      {children ? <span className="days-t">{children}</span> : null}
    </li>
  );
}

/** Recommendations as cards. */
export function Picks({ children }: { children: React.ReactNode }) {
  return <div className="picks">{children}</div>;
}

/** One recommendation: what it is, what it costs, and where to book (the official site). */
export function Pick({ name, price, href, tag, children }: { name: string; price?: string; href?: string; tag?: string; children?: React.ReactNode }) {
  return (
    <article className="pick">
      <header>
        {tag ? <span className="pick-tag">{tag}</span> : null}
        <h3>{name}</h3>
      </header>
      {children ? <div className="pick-body">{children}</div> : null}
      {price || href ? (
        <footer>
          {price ? <span className="pick-price">{price}</span> : <span />}
          {href ? (
            <a className="pick-book" href={href} target="_blank" rel="noopener noreferrer">
              Book<span className="sr-only"> {name} (opens in a new tab)</span> ↗
            </a>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

/** What things cost, as a two-column table with an optional note per row. */
export function Budget({ rows }: { rows: [item: string, cost: string, note?: string][] }) {
  return (
    <table className="budget">
      <tbody>
        {rows.map(([item, cost, note]) => (
          <tr key={item}>
            <th scope="row">
              {item}
              {note ? <small>{note}</small> : null}
            </th>
            <td>{cost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
