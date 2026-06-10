// ── GBM / OU Price Paths Canvas ────────────────────────────────────────────

import { useRef, useEffect } from 'react';

interface GBMCanvasProps {
  paths:  number[][] | null;
  K:      number;
  T:      number;
  isCall: boolean;
  steps?: number;
  label?: string;
}

export function GBMCanvas({ paths, K, T, isCall, steps = 50, label }: GBMCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !paths?.length) return;

    const W = canvas.offsetWidth;
    const H = 240;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, W, H);

    const PL = 46, PR = 56, PT = 12, PB = 26;
    const iW = W - PL - PR, iH = H - PT - PB;

    const all = paths.flat();
    let mn = all[0], mx = all[0];
    for (const v of all) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mn === mx) { mn -= 1; mx += 1; }
    mn *= 0.96; mx *= 1.04;

    const xOf = (i: number) => PL + (i / steps) * iW;
    const yOf = (s: number) => PT + iH * (1 - (s - mn) / (mx - mn));

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const y = PT + frac * iH;
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
      ctx.fillStyle = '#4a6480'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
      ctx.fillText((mx - frac * (mx - mn)).toFixed(0), PL - 4, y + 3.5);
    }

    // Vertical time guides
    [0.25, 0.5, 0.75].forEach(f => {
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PL + f * iW, PT); ctx.lineTo(PL + f * iW, H - PB); ctx.stroke();
    });

    // Strike line
    if (K >= mn && K <= mx) {
      ctx.strokeStyle = 'rgba(240,168,48,.65)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(PL, yOf(K)); ctx.lineTo(W - PR, yOf(K)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f0a830'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`K=${K.toFixed(0)}`, W - PR + 4, yOf(K) + 4);
    }

    // Paths
    let itm = 0;
    paths.forEach(path => {
      const last = path[path.length - 1];
      const hit  = isCall ? last > K : last < K;
      if (hit) itm++;
      ctx.globalAlpha  = 0.42;
      ctx.strokeStyle  = hit ? '#2dd67a' : '#f05149';
      ctx.lineWidth    = 0.9;
      ctx.beginPath();
      path.forEach((s, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(s)) : ctx.lineTo(xOf(i), yOf(s)));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // X axis
    ctx.fillStyle = '#4a6480'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    [0, 0.25, 0.5, 0.75, 1].forEach(f =>
      ctx.fillText((f * T).toFixed(2), PL + f * iW, H - 8)
    );
    ctx.fillStyle = '#2a3e54'; ctx.fillText('t (years)', PL + iW / 2, H - 1);

    // ITM stat (top right)
    ctx.fillStyle = '#4a6480'; ctx.textAlign = 'right'; ctx.font = '10px monospace';
    ctx.fillText(`${itm}/${paths.length} ITM`, W - PR, PT - 2);

  }, [paths, K, T, isCall, steps]);

  return (
    <div>
      {label && (
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[10px] text-dim tracking-widest">{label}</span>
          <div className="flex gap-2 text-[10px] text-dim ml-auto">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-green rounded" />ITM
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-red rounded" />OTM
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-amber" />K
            </span>
          </div>
        </div>
      )}
      <canvas ref={ref} style={{ width: '100%', display: 'block' }} />
    </div>
  );
}