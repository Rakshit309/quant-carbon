// ── Greeks Row with Visual Bars ────────────────────────────────────────────

import type { Greeks } from '../store/pricingStore';

const GK_META = [
  { key: 'delta',            sym: 'Δ', label: 'Delta',  color: '#3b8bfd', desc: '∂V/∂S',    absMax: 1    },
  { key: 'gamma',            sym: 'Γ', label: 'Gamma',  color: '#f0a830', desc: '∂²V/∂S²',  absMax: 0.05 },
  { key: 'vega',             sym: 'ν', label: 'Vega',   color: '#2dd67a', desc: '∂V/∂σ÷100', absMax: 0.5 },
  { key: 'theta',            sym: 'Θ', label: 'Theta',  color: '#f05149', desc: '∂V/∂t÷365', absMax: 0.05 },
  { key: 'rho',              sym: 'ρ', label: 'Rho',    color: '#a87cff', desc: '∂V/∂r÷100', absMax: 1    },
  { key: 'kappaSensitivity', sym: 'κ', label: 'κ-sens', color: '#2dd6c8', desc: '∂V/∂κ',    absMax: 5    },
  { key: 'thetaSensitivity', sym: 'θ', label: 'θ-sens', color: '#f0a830', desc: '∂V/∂θ',    absMax: 1    },
];

interface GreeksRowProps { greeks: Greeks | null; loading: boolean }

export function GreeksRow({ greeks, loading }: GreeksRowProps) {
  const visible = GK_META.filter(g => greeks && greeks[g.key as keyof Greeks] !== undefined);
  const cols = visible.length || 5;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {visible.map(({ key, sym, label, color, desc, absMax }) => {
        const val = greeks?.[key as keyof Greeks] as number | undefined;
        const pct = val != null ? Math.min(Math.abs(val) / absMax * 100, 100) : 0;
        const isNeg = (val ?? 0) < 0;

        return (
          <div
            key={key}
            className="qcard"
            style={{
              textAlign: 'center', padding: '10px 8px',
              background: `${color}0a`, borderColor: `${color}22`,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color, marginBottom: 3 }}>{sym}</div>

            {/* Visual bar */}
            <div style={{
              height: 3, background: 'var(--border)', borderRadius: 2,
              margin: '4px 0 6px', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: loading ? '0%' : `${pct}%`,
                background: isNeg ? '#f05149' : color,
                transition: 'width .3s ease',
                marginLeft: isNeg ? 'auto' : 0,
              }} />
            </div>

            <div style={{
              fontSize: 13, fontWeight: 600,
              color: isNeg ? '#f05149' : 'var(--text)',
              opacity: loading ? .4 : 1, transition: 'opacity .2s',
            }}>
              {loading ? '...' : val != null ? val.toFixed(4) : '—'}
            </div>

            <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{label}</div>
            <div style={{ fontSize: 9, color, opacity: .7, marginTop: 1 }}>{desc}</div>
          </div>
        );
      })}
    </div>
  );
}