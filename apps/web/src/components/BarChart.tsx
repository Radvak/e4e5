import { useState } from 'react';

export interface Series {
  name: string;
  /** Categorical slot colour (validated against the panel surface). */
  color: string;
}

export interface Column {
  label: string;
  /** Short label under the axis (empty to skip). */
  tick: string;
  /** One value per series, stacked bottom to top in series order. */
  values: number[];
}

const W = 900;
const H = 190;
const PAD = { top: 8, right: 8, bottom: 22, left: 30 };
const GAP = 2; // surface gap between stacked segments

/** Rounded top only (data end), square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Axis maximum: round, and even so that the middle tick is a whole number. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  const max = Math.ceil(v / step) * step;
  return max % 2 === 0 ? max : max + step;
}

/**
 * Stacked bar chart in SVG: recessive grid, thin bars with rounded data ends, hover tooltip per
 * column, legend for 2+ series, and a table view for accessibility.
 */
export function BarChart({ title, series, columns, unit }: { title: string; series: Series[]; columns: Column[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = columns.map((c) => c.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(1, ...totals));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / columns.length;
  const barW = Math.max(3, Math.min(18, slot * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        {series.length > 1 && (
          <span className="chart-legend">
            {series.map((s) => (
              <span key={s.name} className="legend-item">
                <span className="swatch square" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="chart-area" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 6} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {columns.map((c, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            let acc = 0;
            const nonZero = c.values.map((v, k) => (v > 0 ? k : -1)).filter((k) => k >= 0);
            const topIndex = nonZero.at(-1);
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                {c.values.map((v, k) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const h = Math.max(1, y0 - y1 - (k === topIndex ? 0 : GAP));
                  const top = k === topIndex ? y1 : y1 + GAP;
                  return k === topIndex ? (
                    <path key={k} d={topRounded(x, top, barW, h, 4)} fill={series[k]!.color} />
                  ) : (
                    <rect key={k} x={x} y={top} width={barW} height={h} fill={series[k]!.color} />
                  );
                })}
                {c.tick && (
                  <text x={x + barW / 2} y={H - 6} className="axis" textAnchor="middle">
                    {c.tick}
                  </text>
                )}
                {/* Hit target: the whole column, wider than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && columns[hover] && (
          <div
            className="chart-tooltip"
            style={{
              left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%`,
              transform: hover > columns.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
            }}
          >
            <strong>{columns[hover].label}</strong>
            {series.map((s, k) => (
              <div key={s.name} className="row tight">
                <span className="swatch square" style={{ background: s.color }} />
                <span>{s.name}</span>
                <span className="spacer" />
                <span>{columns[hover]!.values[k]}</span>
              </div>
            ))}
            {series.length > 1 && (
              <div className="row tight muted">
                <span>Total</span>
                <span className="spacer" />
                <span>{totals[hover]} {unit}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Table</summary>
        <table>
          <thead>
            <tr>
              <th />
              {series.map((s) => <th key={s.name}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={i}>
                <td>{c.label}</td>
                {c.values.map((v, k) => <td key={k}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
