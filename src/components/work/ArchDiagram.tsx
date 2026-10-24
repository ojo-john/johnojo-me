"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

const W = 160, H = 56, GX = 40, GY = 60, PAD = 20;
const COLS = 3;

/** A project's data path as a snake of steps: select a step to read it, or play the data flow. */
export function ArchDiagram({ name, steps }: { name: string; steps: { label: string; note: string }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  const rows = Math.ceil(steps.length / COLS);
  // Left-to-right on even rows, right-to-left on odd rows, so the path never crosses itself.
  const pos = steps.map((_, i) => {
    const r = Math.floor(i / COLS), c = r % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
    return [PAD + c * (W + GX), PAD + r * (H + GY)] as const;
  });
  const path = "M" + pos.map(([x, y]) => `${x + W / 2} ${y + H / 2}`).join(" L");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const play = () => {
    timers.current.forEach(clearTimeout);
    if (reducedMotion) return setSel(null);
    setPlaying(false);
    requestAnimationFrame(() => setPlaying(true));
    timers.current = steps.map((_, i) => window.setTimeout(() => setSel(i), i * 520));
    timers.current.push(window.setTimeout(() => setPlaying(false), steps.length * 520 + 600));
  };

  return (
    <div className={`arch${playing ? " flow" : ""}`}>
      <svg viewBox={`0 0 ${PAD * 2 + COLS * W + (COLS - 1) * GX} ${PAD * 2 + rows * H + (rows - 1) * GY}`} role="img" aria-label={`${name} data path: ${steps.map((s) => s.label).join(", then ")}`}>
        <path className="edge" d={path} />
        {steps.map((s, i) => (
          <g
            key={s.label}
            className={`nd${sel === i ? " sel" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={`Step ${i + 1}: ${s.label}`}
            onClick={() => setSel(i)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(i))}
          >
            <rect x={pos[i][0]} y={pos[i][1]} width={W} height={H} />
            <text x={pos[i][0] + W / 2} y={pos[i][1] + H / 2 + 5} textAnchor="middle">
              {s.label}
            </text>
          </g>
        ))}
        <circle className="packet" r={9} style={{ offsetPath: `path('${path}')` }} />
      </svg>
      <div className="arch-note">
        <p aria-live="polite">{sel === null ? (reducedMotion ? steps.map((s, i) => `${i + 1}. ${s.label}`).join(" → ") : "Select a step to see what it does, or play the data flow.") : `${sel + 1}. ${steps[sel].label}: ${steps[sel].note}`}</p>
        <button className="btn" type="button" onClick={play}>
          ▶ Play data flow
        </button>
      </div>
    </div>
  );
}
