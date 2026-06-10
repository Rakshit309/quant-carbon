// ── Carbon EUA Options Dashboard ───────────────────────────────────────────

import { useEffect } from 'react';
import { usePricingStore } from '../store/pricingStore';
import { ParamPanel }   from '../components/ParamPanel';
import { PricingCards } from '../components/PricingCards';
import { GreeksRow }    from '../components/GreeksRow';
import { GBMCanvas }    from '../components/GBMCanvas';

const BASE_FIELDS = [
  { key: 'S',     label: 'S', desc: 'EUA spot €/tonne', min: 1,    max: 200,  step: 1     },
  { key: 'K',     label: 'K', desc: 'Strike €/tonne',   min: 1,    max: 200,  step: 1     },
  { key: 'T',     label: 'T', desc: 'Maturity yr',       min: 0.01, max: 5,    step: 0.05  },
  { key: 'r',     label: 'r', desc: 'Risk-free rate',    min: 0,    max: 0.2,  step: 0.005 },
  { key: 'sigma', label: 'σ', desc: 'Vol €/tonne√yr',    min: 1,    max: 50,   step: 0.5   },
];

const OU_FIELDS = [
  { key: 'kappa', label: 'κ', desc: 'Mean-reversion speed', min: 0.1, max: 10,  step: 0.1 },
  { key: 'theta', label: 'θ', desc: 'Equilibrium €/tonne',  min: 1,   max: 200, step: 1   },
];

export function CarbonDashboard() {
  const {
    carbonParams, carbonResult, carbonPaths,
    carbonLoading, setCarbonParams, fetchCarbon,
  } = usePricingStore();

  useEffect(() => { fetchCarbon(); }, []);

  const cards = [
    {
      label: 'BACHELIER-OU',   color: '#3b8bfd', sub: 'Closed-form OU process',
      price: carbonResult?.price ?? null,
    },
    {
      label: 'OU MONTE CARLO', color: '#2dd67a', sub: 'N=2,000 OU paths',
      price: carbonResult?.crossCheck?.monteCarlo ?? null,
    },
    {
      label: 'FORWARD PRICE',  color: '#f0a830', sub: 'E[S(T)] — OU mean reversion',
      price: carbonResult?.analytics?.forwardPrice ?? null,
    },
  ];

  const halfLife = carbonResult?.analytics?.halfLifeDays;
  const analytics = carbonResult?.analytics;
  const greeks    = carbonResult?.greeks;

  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: '190px 1fr' }}>

      {/* Left: params */}
      <div className="flex flex-col gap-2">
        <ParamPanel
          params={carbonParams as unknown as Record<string, number | boolean>}
          onChange={(k, v) => setCarbonParams({ [k]: v } as never)}
          fields={BASE_FIELDS}
          isCall={carbonParams.isCall}
          onTypeChange={v => setCarbonParams({ isCall: v })}
          title="EUA PARAMETERS"
        />

        {/* OU model params */}
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="text-[10px] text-dim tracking-widest mb-3">OU MODEL</div>
          <div className="space-y-3">
            {OU_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between">
                <div>
                  <div className="text-teal font-medium" style={{ fontSize: 14 }}>{f.label}</div>
                  <div className="text-dim" style={{ fontSize: 10 }}>{f.desc}</div>
                </div>
                <input
                  type="number"
                  value={carbonParams[f.key as keyof typeof carbonParams] as number}
                  step={f.step} min={f.min} max={f.max}
                  onChange={e => setCarbonParams({ [f.key]: parseFloat(e.target.value) || f.min } as never)}
                  className="w-16 bg-transparent border border-border rounded text-right outline-none px-2 py-1"
                  style={{ fontFamily: 'inherit', fontSize: 12, color: '#2dd6c8', borderColor: '#1a2d45' }}
                />
              </div>
            ))}
          </div>
          {halfLife != null && (
            <div className="mt-3 pt-3 border-t border-border text-[10px] text-dim">
              Half-life: <span style={{ color: '#2dd6c8' }} className="font-medium">{halfLife.toFixed(0)} days</span>
              <span className="ml-2">({(halfLife / 30.44).toFixed(1)} months)</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: results */}
      <div className="flex flex-col gap-3">
        <PricingCards cards={cards} loading={carbonLoading} />
        <GreeksRow greeks={greeks ?? null} loading={carbonLoading} />

        {/* OU Paths */}
        <div className="bg-surface border border-border rounded-lg p-3">
          <GBMCanvas
            paths={carbonPaths}
            K={carbonParams.K}
            T={carbonParams.T}
            isCall={carbonParams.isCall}
            label="OU PRICE PATHS — dS = κ(θ−S)dt + σdW"
          />
        </div>

        {/* Carbon analytics */}
        {analytics && (
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-dim tracking-widest mb-2">BACHELIER-OU ANALYTICS</div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-[10px] text-dim mb-1">Forward Price</div>
                <div className="text-sm font-medium" style={{ color: '#3b8bfd' }}>
                  {analytics.forwardPrice != null ? `€${analytics.forwardPrice.toFixed(3)}` : '—'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-dim mb-1">Terminal StdDev</div>
                <div className="text-sm font-medium" style={{ color: '#2dd67a' }}>
                  {analytics.terminalStdDev != null ? `€${analytics.terminalStdDev.toFixed(3)}` : '—'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-dim mb-1">Time Value</div>
                <div className="text-sm font-medium" style={{ color: '#f0a830' }}>
                  {analytics.timeValue != null ? `€${analytics.timeValue.toFixed(4)}` : '—'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-dim mb-1">Moneyness</div>
                <div className="text-sm font-medium" style={{ color: '#a87cff' }}>
                  {analytics.moneyness ?? '—'}
                </div>
              </div>
            </div>

            {/* Positive theta explanation */}
            {(greeks?.theta ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-border text-[10px] text-dim p-2 rounded"
                style={{ background: 'rgba(240,168,48,.05)' }}>
                <span style={{ color: '#f0a830' }} className="font-medium">Positive theta</span>
                {' '}— S ({carbonParams.S}) &gt; θ ({carbonParams.theta}).{' '}
                Forward price ({analytics.forwardPrice?.toFixed(2)}) is below strike ({carbonParams.K}).{' '}
                As expiry approaches, F rises toward S, increasing option value.{' '}
                Black-Scholes cannot model this.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}