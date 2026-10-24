import "server-only";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { Fn, Ref } from "@/components/journal/Reader";
import { passage, passageUrl } from "./scripture";

/** Stable heading ids so the table of contents can link to them. */
export const headingId = (text: string) => "h-" + text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function headingsOf(source: string) {
  return [...source.matchAll(/^##\s+(.+)$/gm)].map((m) => ({ id: headingId(m[1].trim()), text: m[1].trim() }));
}

/** Every scripture key referenced by <Scripture k="…"/> or <Ref k="…"/>, in order of appearance. */
export function scriptureKeysOf(source: string) {
  return [...new Set([...source.matchAll(/<(?:Scripture|Ref)\s+k="([^"]+)"/g)].map((m) => m[1]))];
}

function Scripture({ k }: { k: string }) {
  const p = passage(k);
  return (
    <figure className="verse" style={{ marginInline: 0 }}>
      <div className="r">{p.ref} · World English Bible</div>
      <blockquote>{p.text}</blockquote>
      <a href={passageUrl(k)} target="_blank" rel="noopener noreferrer">
        Read the passage ↗
      </a>
    </figure>
  );
}

function Pull({ children }: { children: React.ReactNode }) {
  return (
    <p className="pull" aria-hidden="true">
      {children}
    </p>
  );
}

const textOf = (node: React.ReactNode): string =>
  typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join("") : "";

/** Compile a post's MDX at build time. Posts are authored by the site owner, never by visitors. */
export async function renderPost(source: string) {
  const { default: Content } = await evaluate(source, { ...runtime, baseUrl: import.meta.url });
  return (
    <Content
      components={{
        Scripture,
        Ref,
        Fn,
        Pull,
        h2: ({ children }: { children?: React.ReactNode }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
      }}
    />
  );
}
