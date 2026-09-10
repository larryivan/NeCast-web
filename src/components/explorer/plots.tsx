// Observable Plot charts of the corpus explorer, drawn in the manuscript's style:
// thin axes, truth as a step, colours only where they carry meaning.
import * as Plot from '@observablehq/plot';
import { useEffect, useRef, useState } from 'react';
import { pow10Tick } from './data';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const STYLE = { fontFamily: 'inherit', fontSize: '11px', background: 'transparent' };

/** Compact counts for axis ticks: 0, 500, 1k, 2.5k, 1M. */
const compact = (d: number) => (d === 0 ? '0' : d >= 1e6 ? `${+(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `${+(d / 1e3).toFixed(1)}k` : String(d));

/** The 64 interval labels of one window as a step, on log axes (generations ago, Ne). */
export function LabelsPlot({ labels, edges, xLabel }: { labels: number[]; edges: number[]; xLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => {
    if (!ref.current || width === 0) return;
    const steps = labels.flatMap((y, b) => [
      { x: edges[b], y: 10 ** y },
      { x: edges[b + 1], y: 10 ** y },
    ]);
    const lo = Math.min(...labels);
    const hi = Math.max(...labels);
    const pad = Math.max(0.25, (hi - lo) * 0.08);
    const plot = Plot.plot({
      width,
      height: 220,
      marginLeft: 44,
      marginBottom: 36,
      style: STYLE,
      x: { type: 'log', domain: [edges[0], edges[edges.length - 1]], label: xLabel, labelAnchor: 'center', labelArrow: 'none', tickFormat: pow10Tick, ticks: [1e2, 1e3, 1e4, 1e5] },
      y: {
        type: 'log',
        domain: [10 ** Math.max(1.8, lo - pad), 10 ** Math.min(6.2, hi + pad)],
        label: 'Nₑ',
        labelAnchor: 'top',
        labelArrow: 'none',
        tickFormat: compact,
        ticks: 4,
      },
      marks: [Plot.line(steps, { x: 'x', y: 'y', stroke: 'currentColor', strokeWidth: 1.3 })],
    });
    ref.current.replaceChildren(plot);
    return () => plot.remove();
  }, [labels, edges, width, xLabel]);
  return <div ref={ref} className="w-full" />;
}

export interface SitesBin {
  lo: number;
  hi: number;
  all: number;
  matching: number;
}

/**
 * Variant sites per window on a log axis. The selection is drawn in NeCast blue on its own scale;
 * all windows are the grey shape behind it, scaled to the same height so the two shapes compare.
 */
export function SitesHistogram({ bins, xLabel, colour }: { bins: SitesBin[]; xLabel: string; colour: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => {
    if (!ref.current || width === 0) return;
    const maxAll = Math.max(...bins.map((d) => d.all));
    const maxMatching = Math.max(...bins.map((d) => d.matching));
    const scale = maxMatching > 0 && maxAll > 0 ? maxMatching / maxAll : 1;
    const plot = Plot.plot({
      width,
      height: 128,
      marginLeft: 44,
      marginBottom: 32,
      style: STYLE,
      x: { type: 'log', domain: [10 ** bins[0].lo, 10 ** bins[bins.length - 1].hi], label: xLabel, labelAnchor: 'center', labelArrow: 'none', tickFormat: pow10Tick, ticks: [1e3, 1e4, 1e5, 1e6, 1e7] },
      y: { label: null, grid: true, tickFormat: compact, ticks: 3 },
      marks: [
        Plot.rectY(bins, { x1: (d: SitesBin) => 10 ** d.lo, x2: (d: SitesBin) => 10 ** d.hi, y: (d: SitesBin) => d.all * scale, fill: 'currentColor', fillOpacity: 0.14, inset: 0 }),
        Plot.rectY(bins, { x1: (d: SitesBin) => 10 ** d.lo, x2: (d: SitesBin) => 10 ** d.hi, y: 'matching', fill: colour, inset: 0 }),
        Plot.ruleY([0], { stroke: 'currentColor', strokeOpacity: 0.4 }),
      ],
    });
    ref.current.replaceChildren(plot);
    return () => plot.remove();
  }, [bins, width, xLabel, colour]);
  return <div ref={ref} className="w-full" />;
}
