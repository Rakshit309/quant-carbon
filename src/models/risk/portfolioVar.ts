// ── Portfolio Value at Risk Engine ────────────────────────────────────────
// Computes VaR and Expected Shortfall for a mixed portfolio of equity
// and carbon options using Monte Carlo full revaluation.
//
// WHAT IS VaR?
// Value at Risk answers: "What is the maximum loss I expect to exceed
// only X% of trading days?" A 99% 1-day VaR of €50,000 means:
// on 99 out of 100 trading days, losses will be less than €50,000.
// On the remaining 1 day, losses exceed this threshold.
//
// WHAT IS EXPECTED SHORTFALL (ES/CVaR)?
// ES fixes VaR's blind spot. VaR tells you WHERE the tail starts.
// ES tells you HOW BAD the tail is — the average loss WITHIN the
// worst 1% of days. ES is required under Basel III/FRTB because
// it is a coherent risk measure (diversification always reduces it).
//
// CONNECTION TO YOUR CREDIT RISK BACKGROUND:
// VaR → maximum loss at confidence level → analogous to stressed EAD
// ES  → average loss in the tail         → analogous to Lifetime ECL
// The three-scenario IFRS 9 framework is a discrete version of ES:
// probability-weighting outcomes across base/upside/downside.
//
// METHODOLOGY: Monte Carlo Full Revaluation
// For each of N scenarios:
//   1. Shock the spot price using GBM or OU dynamics
//   2. Shock the implied volatility (correlated with price move)
//   3. Reprice every position in the portfolio analytically
//   4. Record the portfolio P&L
// Sort the N P&Ls and read off the percentiles.
//
// This is "full revaluation" VaR — more accurate than delta-gamma
// approximation because it captures the non-linear payoff of options
// (the gamma effect that delta-only approaches miss).

import { bsPrice, bsGreeks }            from '../../core/blackScholes';
import { bachelierPrice, bachelierGreeks } from '../carbon/bachelier';
import { randNormal }                    from '../../core/distributions';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Position {
  id:        string;
  S:         number;      // Current spot price
  K:         number;      // Strike price
  T:         number;      // Time to maturity (years)
  r:         number;      // Risk-free rate
  sigma:     number;      // Implied vol (% for BS, absolute for Bachelier)
  isCall:    boolean;
  quantity:  number;      // +ve = long, -ve = short
  notional?: number;      // € per unit of quantity (default 1)
  model?:    'bs' | 'bachelier';
  kappa?:    number;      // OU mean-reversion (Bachelier only)
  theta?:    number;      // OU long-run equilibrium (Bachelier only)
}

export interface VaRParams {
  positions:        Position[];
  confidenceLevel?: number;   // 0.99 (default) or 0.95
  horizon?:         number;   // Trading days (default 1)
  N?:               number;   // Scenarios (default 10000)
  volOfVol?:        number;   // Vol-of-vol (default 0.8)
  correlation?:     number;   // S-vol correlation (default -0.3)
}

export interface PositionRisk {
  id:           string;
  currentPrice: number;
  dollarValue:  number;   // currentPrice × quantity × notional
  delta:        number;
  gamma:        number;
  vega:         number;
  theta:        number;
  dollarDelta:  number;   // delta × quantity × notional × S
  dollarGamma:  number;   // ½ × gamma × quantity × notional × S²
  dollarVega:   number;   // vega × quantity × notional
}

export interface VaRResult {
  // ── Primary risk metrics ───────────────────────────────────────────
  var99:              number;   // 1-day 99% VaR (positive = loss)
  var95:              number;   // 1-day 95% VaR
  es99:               number;   // Expected Shortfall at 99%
  es95:               number;   // Expected Shortfall at 95%

  // ── Portfolio summary ──────────────────────────────────────────────
  portfolioValue:     number;   // Current mark-to-market value
  portfolioDelta:     number;   // Aggregate dollar delta
  portfolioGamma:     number;   // Aggregate dollar gamma
  portfolioVega:      number;   // Aggregate dollar vega

  // ── Scenario statistics ────────────────────────────────────────────
  worstLoss:          number;   // Maximum loss across all scenarios
  bestGain:           number;   // Maximum gain across all scenarios
  meanPnL:            number;   // Expected daily P&L (should be ~0)
  pnlStdDev:          number;   // Standard deviation of daily P&L

  // ── Distribution ──────────────────────────────────────────────────
  pnlPercentiles:     Record<string, number>;  // p1, p5, p25, p50, p75, p95, p99
  scenarioPnL:        number[];  // Sorted P&L distribution (for histogram)

  // ── Position-level breakdown ───────────────────────────────────────
  positions:          PositionRisk[];

  // ── Metadata ──────────────────────────────────────────────────────
  N:                  number;
  horizon:            number;
  confidenceLevel:    number;
  methodology:        string;
}

// ── Price a single position ───────────────────────────────────────────────

function pricePosition(
  pos: Position,
  S_shocked: number,
  sigma_shocked: number
): number {
  const notional = pos.notional ?? 1;
  const qty      = pos.quantity;

  if (pos.model === 'bachelier') {
    const result = bachelierPrice({
      S:     S_shocked,
      K:     pos.K,
      T:     pos.T,
      r:     pos.r,
      sigma: sigma_shocked,
      isCall: pos.isCall,
      kappa: pos.kappa ?? 1.0,
      theta: pos.theta ?? pos.S,
    });
    return result.price * qty * notional;
  }

  // Default: Black-Scholes
  return bsPrice({
    S:      S_shocked,
    K:      pos.K,
    T:      pos.T,
    r:      pos.r,
    sigma:  sigma_shocked,
    isCall: pos.isCall,
  }) * qty * notional;
}

// ── Compute Greeks for a position ────────────────────────────────────────

function positionRisk(pos: Position): PositionRisk {
  const notional     = pos.notional ?? 1;
  const qty          = pos.quantity;
  let price = 0, delta = 0, gamma = 0, vega = 0, theta = 0;

  if (pos.model === 'bachelier') {
    const pr = bachelierPrice({
      S: pos.S, K: pos.K, T: pos.T, r: pos.r,
      sigma: pos.sigma, isCall: pos.isCall,
      kappa: pos.kappa ?? 1.0, theta: pos.theta ?? pos.S,
    });
    const gr = bachelierGreeks({
      S: pos.S, K: pos.K, T: pos.T, r: pos.r,
      sigma: pos.sigma, isCall: pos.isCall,
      kappa: pos.kappa ?? 1.0, theta: pos.theta ?? pos.S,
    });
    price = pr.price; delta = gr.delta; gamma = gr.gamma;
    vega  = gr.vega;  theta = gr.theta;
  } else {
    price = bsPrice({ S: pos.S, K: pos.K, T: pos.T, r: pos.r, sigma: pos.sigma, isCall: pos.isCall });
    const gr = bsGreeks({ S: pos.S, K: pos.K, T: pos.T, r: pos.r, sigma: pos.sigma, isCall: pos.isCall });
    delta = gr.delta; gamma = gr.gamma; vega = gr.vega; theta = gr.theta;
  }

  return {
    id:           pos.id,
    currentPrice: price,
    dollarValue:  price   * qty * notional,
    delta,
    gamma,
    vega,
    theta,
    dollarDelta:  delta   * qty * notional * pos.S,
    dollarGamma:  0.5 * gamma * qty * notional * pos.S * pos.S,
    dollarVega:   vega    * qty * notional,
  };
}

// ── Main VaR Engine ───────────────────────────────────────────────────────

export function computeVaR(params: VaRParams): VaRResult {
  const {
    positions,
    confidenceLevel = 0.99,
    horizon         = 1,
    N               = 10000,
    volOfVol        = 0.80,
    correlation     = -0.30,
  } = params;

  if (positions.length === 0) {
    throw new Error('Portfolio must contain at least one position');
  }

  const dt = horizon / 252;  // Convert trading days to years

  // ── Compute current position Greeks ──────────────────────────────
  const positionRisks = positions.map(positionRisk);
  const portfolioValue = positionRisks.reduce((s, p) => s + p.dollarValue,  0);
  const portfolioDelta = positionRisks.reduce((s, p) => s + p.dollarDelta,  0);
  const portfolioGamma = positionRisks.reduce((s, p) => s + p.dollarGamma,  0);
  const portfolioVega  = positionRisks.reduce((s, p) => s + p.dollarVega,   0);

  // ── Simulate N scenarios ──────────────────────────────────────────
  // Each scenario shocks ALL positions simultaneously using correlated
  // random variables (one shock per position, correlated across positions).
  // For simplicity, we use a single market factor (one shock per position).
  // Production systems use multi-factor models (PCA on the covariance matrix).
  //
  // Price shock:  S' = S × exp(-½σ²dt + σ√dt × Z1)
  // Vol shock:    σ' = σ × exp(σ_v × √dt × Z2) where Z2 = ρZ1 + √(1-ρ²)Z_ind
  // This embeds the negative vol-spot correlation observed in equity markets.

  const scenarioPnL: number[] = new Array(N);

  for (let i = 0; i < N; i++) {
    const Z1   = randNormal();
    const Zind = randNormal();
    const Z2   = correlation * Z1 + Math.sqrt(1 - correlation * correlation) * Zind;

    let scenarioValue = 0;

    for (const pos of positions) {
      const notional = pos.notional ?? 1;

      // Shock spot price using GBM (zero drift for VaR — P-measure with μ=0)
      const S_shocked     = pos.S * Math.exp(-0.5 * pos.sigma * pos.sigma * dt
                          + pos.sigma * Math.sqrt(dt) * Z1);

      // Shock implied volatility — log-normal to keep vol positive
      const sigma_shocked = Math.max(
        pos.sigma * Math.exp(volOfVol * Math.sqrt(dt) * Z2),
        0.001
      );

      scenarioValue += pricePosition(pos, S_shocked, sigma_shocked);
    }

    scenarioPnL[i] = scenarioValue - portfolioValue;
  }

  // ── Compute VaR and ES ────────────────────────────────────────────
  const sorted = [...scenarioPnL].sort((a, b) => a - b);
  const n      = sorted.length;

  const pctIdx = (p: number) => Math.max(0, Math.floor(n * p) - 1);

  const var99 = -sorted[pctIdx(1 - confidenceLevel < 0.01 ? 0.01 : 1 - confidenceLevel)];
  const var95 = -sorted[pctIdx(0.05)];

  // ES = average of losses BEYOND VaR
  const cutoff99 = Math.floor(n * 0.01);
  const cutoff95 = Math.floor(n * 0.05);
  const es99 = -(sorted.slice(0, cutoff99).reduce((s, v) => s + v, 0) / cutoff99);
  const es95 = -(sorted.slice(0, cutoff95).reduce((s, v) => s + v, 0) / cutoff95);

  // ── Distribution statistics ───────────────────────────────────────
  const mean   = scenarioPnL.reduce((s, v) => s + v, 0) / n;
  const stdDev = Math.sqrt(scenarioPnL.reduce((s, v) => s + (v - mean) ** 2, 0) / n);

  const pnlPercentiles: Record<string, number> = {};
  [1, 5, 25, 50, 75, 95, 99].forEach(p => {
    pnlPercentiles[`p${p}`] = +sorted[pctIdx(p / 100)].toFixed(2);
  });

  // Return a sample of 200 evenly-spaced P&Ls for histogram rendering
  const step    = Math.floor(n / 200);
  const sample  = sorted.filter((_, i) => i % step === 0).slice(0, 200);

  return {
    var99:           +var99.toFixed(2),
    var95:           +var95.toFixed(2),
    es99:            +es99.toFixed(2),
    es95:            +es95.toFixed(2),
    portfolioValue:  +portfolioValue.toFixed(2),
    portfolioDelta:  +portfolioDelta.toFixed(2),
    portfolioGamma:  +portfolioGamma.toFixed(2),
    portfolioVega:   +portfolioVega.toFixed(2),
    worstLoss:       +(-sorted[0]).toFixed(2),
    bestGain:        +sorted[n - 1].toFixed(2),
    meanPnL:         +mean.toFixed(4),
    pnlStdDev:       +stdDev.toFixed(4),
    pnlPercentiles,
    scenarioPnL:     sample.map(v => +v.toFixed(2)),
    positions:       positionRisks,
    N,
    horizon,
    confidenceLevel,
    methodology:     'Monte Carlo full revaluation — correlated price and vol shocks',
  };
}