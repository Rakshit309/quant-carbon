// ── Portfolio VaR Dashboard ────────────────────────────────────────────────

import { useState } from 'react';

const API = 'https://quant-carbon.shoumyadeep309.workers.dev';
const KEY  = 'demo';

interface VaRResult {
  riskMetrics:  { var99: number; var95: number; es99: number; es95: number };
  portfolio:    { value: number; dollarDelta: number; dollarGamma: number; dollarVega: number };
  distribution: { worstLoss: number; bestGain: number; mean: number; stdDev: number; percentiles: Record<string, number> };
  positions:    { id: string; value: number; delta: number; gamma: number; vega: number; dollarDelta: number }[];
  scenarios:    number;
}

const DEFAULT_POSITIONS = [
  { id: 'equity-call', S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2,  isCall: true,  quantity: 100, model: 'bs'       },
  { id: 'carbon-call', S: 65,  K: 65,  T: 1, r: 0.04, sigma: 15,   isCall: true,  quantity: 50,  model: 'bachelier', kappa: 1.0, theta: 60 },
];

export function VaRDashboard() {
  const [result,  setResult]  = useState<VaRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [N,       setN]       = useState(10000);
  const [conf,    setConf]    = useState(0.99);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/portfolio_var`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
        body:    JSON.stringify({ positions: DEFAULT_POSITIONS, confidenceLevel: conf, horizon: 1, N }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const r = result?.riskMetrics;
  const p = result?.portfolio;

  return (
    <div className="p-4 space-y-3">
      {/* Config + run */}
      <div className="bg-surface border border-border rounded-lg p-3 flex items-center gap-4 flex-wrap">
        <div className="text-[10px] text-dim tracking-widest">PORTFOLIO VaR — 100 equity calls + 50 EUA calls</div>

        <div className="flex items-center gap-2">
          <span className="text-dim text-xs">Confidence</span>
          <select value={conf} onChange={e => setConf(+e.target.value)}
            className="bg-transparent border border-border rounded px-2 py-1 text-xs text-blue outline-none"
            style={{ fontFamily: 'inherit' }}>
            <option value={0.99}>99%</option>
            <option value={0.95}>95%</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-dim text-xs">Scenarios</span>
          <select value={N} onChange={e => setN(+e.target.value)}
            className="bg-transparent border border-border rounded px-2 py-1 text-xs text-blue outline-none"
            style={{ fontFamily: 'inherit' }}>
            <option value={5000}>5,000</option>
            <option value={10000}>10,000</option>
            <option value={50000}>50,000</option>
          </select>
        </div>

        <button onClick={run} disabled={loading}
          className="ml-auto px-4 py-2 rounded-lg text-xs font-medium transition-opacity"
          style={{ background: 'rgba(59,139,253,.15)', border: '1px solid rgba(59,139,253,.4)',
                   color: '#3b8bfd', fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer',
                   opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Computing...' : '▶ Run VaR'}
        </button>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-xs text-red">{error}</div>
      )}

      {result && (
        <>
          {/* Primary risk metrics */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: `${(conf*100).toFixed(0)}% VaR`,   val: r?.var99 ?? r?.var95, color: '#f05149', desc: 'Maximum loss on 99% of days'  },
              { label: `${(conf*100).toFixed(0)}% ES`,    val: r?.es99  ?? r?.es95,  color: '#f0a830', desc: 'Average loss in worst 1%'      },
              { label: 'Portfolio Value',                  val: p?.value,             color: '#3b8bfd', desc: 'Current mark-to-market'         },
              { label: 'Dollar Delta',                     val: p?.dollarDelta,       color: '#2dd67a', desc: '$ P&L per $1 spot move'         },
            ].map(({ label, val, color, desc }) => (
              <div key={label} className="bg-surface border border-border rounded-lg p-3"
                style={{ borderTop: `3px solid ${color}` }}>
                <div className="text-[10px] text-dim mb-1 tracking-widest">{label}</div>
                <div className="text-2xl font-semibold" style={{ color }}>${val?.toFixed(2) ?? '—'}</div>
                <div className="text-[10px] text-dim mt-1">{desc}</div>
              </div>
            ))}
          </div>

          {/* P&L distribution */}
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-dim tracking-widest mb-3">P&L DISTRIBUTION — {result.scenarios.toLocaleString()} scenarios</div>
            <div className="grid grid-cols-7 gap-2">
              {Object.entries(result.distribution.percentiles ?? {}).map(([key, val]) => (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-dim mb-1">{key}</div>
                  <div className="text-xs font-medium" style={{ color: (val as number) < 0 ? '#f05149' : '#2dd67a' }}>
                    ${(val as number).toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-6 mt-3 pt-3 border-t border-border text-[10px] text-dim">
              <span>Worst loss: <b className="text-red">${result.distribution.worstLoss.toFixed(2)}</b></span>
              <span>Best gain: <b className="text-green">${result.distribution.bestGain.toFixed(2)}</b></span>
              <span>Methodology: Monte Carlo full revaluation — correlated price and vol shocks</span>
            </div>
          </div>

          {/* Position breakdown */}
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-dim tracking-widest mb-3">POSITION BREAKDOWN</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-dim border-b border-border">
                  {['Position','Value','Delta','Gamma','Vega','$ Delta'].map(h => (
                    <th key={h} className="text-left pb-2 pr-3 font-normal tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.positions.map(pos => (
                  <tr key={pos.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 text-blue">{pos.id}</td>
                    <td className="py-2 pr-3">${pos.value.toFixed(2)}</td>
                    <td className="py-2 pr-3">{pos.delta.toFixed(4)}</td>
                    <td className="py-2 pr-3">{pos.gamma.toFixed(5)}</td>
                    <td className="py-2 pr-3">{pos.vega.toFixed(4)}</td>
                    <td className="py-2 pr-3">${pos.dollarDelta.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-dim text-xs">
          Click <span className="text-blue">▶ Run VaR</span> to compute Monte Carlo portfolio risk
        </div>
      )}
    </div>
  );
}