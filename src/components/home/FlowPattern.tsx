/**
 * Faint background for the home Work panel: a real project's data flow (CodeQuest today), drawn as a
 * zigzag of boxes and connectors. Decorative only; the full diagram with notes lives on /work/.
 */
const BOX_W = 150;
const BOX_H = 38;
const ROW_GAP = 74;
const COLS = [28, 182];
const TOP = 56;

export function FlowPattern({ title, steps }: { title: string; steps: string[] }) {
  if (steps.length === 0) return null;
  const boxes = steps.map((label, i) => ({ label, x: COLS[i % 2], y: TOP + i * ROW_GAP }));
  const height = TOP + steps.length * ROW_GAP + 20;
  return (
    <svg className="flow" viewBox={`0 0 360 ${height}`} preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
      <text x={COLS[0]} y={28} className="flow-cap">
        {title} · data flow
      </text>
      {boxes.slice(1).map((b, i) => {
        const a = boxes[i];
        const midY = a.y + BOX_H + (ROW_GAP - BOX_H) / 2;
        return <path key={b.label} d={`M${a.x + BOX_W / 2} ${a.y + BOX_H} V${midY} H${b.x + BOX_W / 2} V${b.y}`} />;
      })}
      {boxes.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={BOX_W} height={BOX_H} />
          <text x={b.x + 12} y={b.y + BOX_H / 2 + 4}>
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
