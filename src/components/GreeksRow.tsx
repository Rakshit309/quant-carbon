// ── Greeks Row ─────────────────────────────────────────────────────────────

import type { Greeks } from '../store/pricingStore';

const GK_META = [
  { key: 'delta',           sym: 'Δ', label: 'Delta',  color: '#3b8bfd', desc: '∂V/∂S' },
  { key: 'gamma',           sym: 'Γ', label: 'Gamma',  color: '#f0a830', desc: '∂²V/∂S²' },
  { key: 'vega',            sym: 'ν', label: 'Vega',   color: '#2dd67a', desc: '∂V/∂σ' },
  { key: 'theta',           sym: 'Θ', label: 'Theta',  color: '#f05149', desc: '∂V/∂t' },
  { key: 'rho',             sym: 'ρ', label: 'Rho',    color: '#a87cff', desc: '∂V/∂r' },
  { key: 'kappaSensitivity',sym: 'κ', label: 'κ-sens', color: '#2dd6c8', desc: '∂V/∂κ' },
  { key: 'thetaSensitivity',sym: 'θ', label: 'θ-sens', color: '#f0a830', desc: '∂V/∂θ' },
];

interface GreeksRowProps { greeks: Greeks | null; loading: boolean }

export function GreeksRow({ greeks, loading }: GreeksRowProps) {
  const visible = GK_META.filter(g => greeks && greeks[g.key as keyof Greeks] !== undefined);

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visible.length || 5}, 1fr)` }}>
      {visible.map(({ key, sym, label, color, desc }) => {
        const val = greeks?.[key as keyof Greeks] as number | undefined;
        return (
          <div key={key} className="bg-surface border border-border rounded-lg py-2 px-1 text-center"
            style={{ borderColor: `${color}22`, background: `${color}0a` }}>
            <div className="text-lg font-semibold" style={{ color }}>{sym}</div>
            <div className="text-sm font-medium mt-1">
              {loading ? '...' : val != null ? val.toFixed(4) : '—'}
            </div>
            <div className="text-[10px] text-dim mt-1">{label}</div>
            <div className="text-[10px]" style={{ color: `${color}80` }}>{desc}</div>
          </div>
        );
      })}
    </div>
  );
}