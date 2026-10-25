import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap" style={{ paddingBlock: "96px 120px" }}>
      <span className="kicker" style={{ color: "var(--ink-2)" }}>
        404
      </span>
      <h1 style={{ fontSize: "clamp(48px, 7vw, 96px)", marginTop: 10 }}>Wrong turn.</h1>
      <p style={{ fontSize: 18, color: "var(--ink-2)", marginTop: 16, maxWidth: "46ch" }}>That page doesn&apos;t exist, or it moved. Try one of these instead.</p>
      <div className="ctas">
        <Link className="btn fill" href="/">
          Home
        </Link>
        <Link className="btn" href="/work/">
          Work
        </Link>
        <Link className="btn" href="/travel/">
          Travel
        </Link>
      </div>
    </section>
  );
}
