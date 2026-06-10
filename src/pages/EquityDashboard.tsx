// ── Equity Options Dashboard ───────────────────────────────────────────────

import { useEffect } from 'react';
import { usePricingStore } from '../store/pricingStore';
import { ParamPanel }   from '../components/ParamPanel';
import { PricingCards } from '../components/PricingCards';
import { GreeksRow }    from '../components/GreeksRow';
import { GBMCanvas }    from '../components/GBMCanvas';

const FIELDS = [
  { key: 'S',     label: 'S', desc: 'Spot price',    min: 1,    max: 1000, step: 1     },
  { key: 'K',     label: 'K', desc: 'Strike',        min: 1,    max: 1000, step: 1     },
  { key: 'T',     label: 'T', desc: 'Maturity yr',   min: 0.01, max: 5,    step: 0.05  },
  { key: 'r',     label: 'r', desc: 'Risk-free rate', min: 0,   max: 0.3,  step: 0.005 },
  { key: 'sigma', label: 'σ', desc: 'Volatility',    min: 0.01, max: 1,    step: 0.01  },
];

export function EquityDashboard() {
  const {
    equityParams, equityResult, equityPaths,
    equityLoading, setEquityParams, fetchEquity,
  } = usePricingStore();

  useEffect(() => { fetchEquity(); }, []);

  const cards = [
    {
      label: 'BLACK-SCHOLES', color: '#3b8bfd', sub: 'Analytical closed-form',
      price: equityResult?.price ?? null,
    },
    {
      label: 'MONTE CARLO',   color: '#2dd67a', sub: 'N=2,000 GBM paths',
      price: equityResult?.crossCheck?.monteCarlo ?? null,
      ci:    equityResult?.crossCheck?.ci95,
    },
    {
      label: 'FINITE DIFF.',  color: '#f0a830', sub: 'Crank-Nicolson Ns=100',
      price: equityResult?.crossCheck?.finDifference ?? null,
    },
  ];

  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: '190px 1fr' }}>
      {/* Left: params */}
      <ParamPanel
        params={equityParams as unknown as Record<string, number | boolean>}
        onChange={(k, v) => setEquityParams({ [k]: v } as never)}
        fields={FIELDS}
        isCall={equityParams.isCall}
        onTypeChange={v => setEquityParams({ isCall: v })}
      />

      {/* Right: results */}
      <div className="flex flex-col gap-3">
        <PricingCards cards={cards} loading={equityLoading} />
        <GreeksRow greeks={equityResult?.greeks ?? null} loading={equityLoading} />

        {/* GBM Paths */}
        <div className="bg-surface border border-border rounded-lg p-3">
          <GBMCanvas
            paths={equityPaths}
            K={equityParams.K}
            T={equityParams.T}
            isCall={equityParams.isCall}
            label="GBM PRICE PATHS — dS = rS·dt + σS·dW"
          />
        </div>

        {/* Analytics */}
        {equityResult?.analytics && (
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-dim tracking-widest mb-2">ANALYTICS</div>
            <div className="flex gap-6 text-xs">
              <span>Moneyness: <b className="text-blue">{equityResult.analytics.moneyness}</b></span>
              {equityResult.crossCheck?.maxDivergence != null && (
                <span>Max divergence: <b className="text-amber">${equityResult.crossCheck.maxDivergence.toFixed(4)}</b></span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}