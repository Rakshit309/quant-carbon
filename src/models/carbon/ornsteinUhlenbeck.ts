// ── Ornstein-Uhlenbeck Carbon Price Model ─────────────────────────────────
// Carbon prices behave differently from equity prices in one fundamental way:
// they are MEAN-REVERTING. When the EUA price rises far above the policy
// equilibrium, abatement activity increases and demand falls, pulling the
// price back down. When the price falls below the marginal abatement cost,
// compliance buyers step in, pulling it back up.
//
// The Ornstein-Uhlenbeck (OU) process captures this:
//   dS = κ(θ − S)dt + σdW
//
// Three parameters govern the process:
//   κ (kappa) — mean-reversion speed. Typical EU ETS estimate: 0.8–1.5
//               Half-life = ln(2)/κ ≈ 5–10 months for these values.
//               High κ → fast snap-back to equilibrium (strong policy signal)
//               Low κ  → slow drift, price wanders far from equilibrium
//
//   θ (theta) — long-run equilibrium price (€/tonne). The price the market
//               gravitates toward when no shocks occur. Determined by the
//               marginal abatement cost at the cap level. ~€55–70 for EU ETS.
//
//   σ (sigma) — ABSOLUTE volatility in €/tonne per √year. Unlike GBM where
//               sigma is a percentage, here it is in price units directly.
//               Typical EU ETS: σ ≈ 10–20 €/tonne per √year.
//
// KEY DIFFERENCE FROM GBM:
//   GBM step:  S = S × exp((r−½σ²)dt + σ√dt·Z)   ← multiplicative
//   OU  step:  S = S + κ(θ−S)dt + σ√dt·Z          ← additive
//
// The additive noise means the OU process can theoretically go negative.
// For EU ETS carbon prices (currently €50–90), this is not a practical
// concern — carbon prices have a political price floor and have never
// approached zero in the compliance market.
//
// CONNECTION TO YOUR CREDIT RISK BACKGROUND:
// The OU process is structurally identical to the Vasicek interest rate
// model used in credit risk — the same model that underlies Hull-White
// rate simulations in IFRS 17 stochastic runs. If you have seen Vasicek
// in interest rate stress testing, you have already seen OU.

import { randNormal } from '../../core/distributions';

// ── Types ─────────────────────────────────────────────────────────────────

export interface OUParams {
  S: number;        // Current carbon price (€/tonne)
  K: number;        // Strike price (€/tonne)
  T: number;        // Time to maturity (years)
  r: number;        // Risk-free rate (continuously compounded)
  kappa: number;    // Mean-reversion speed κ
  theta: number;    // Long-run equilibrium price θ (€/tonne)
  sigma: number;    // Absolute volatility (€/tonne per √year)
  isCall: boolean;
  N?: number;       // Monte Carlo paths (default 2000)
  steps?: number;   // Steps per path (default 50)
}

export interface OUMCResult {
  price: number;
  stdError: number;
  ci95: [number, number];
  paths: number[][];         // First 60 paths for visualisation
  terminalPrices: number[];  // All terminal prices for distribution
  halfLife: number;          // ln(2)/κ — intuitive measure of mean reversion
  forwardPrice: number;      // E[S(T)] — expected carbon price at expiry
  terminalStdDev: number;    // Std dev of terminal distribution
}

// ── OU Monte Carlo Pricer ─────────────────────────────────────────────────

export function ouMonteCarlo(p: OUParams): OUMCResult {
  const N      = p.N      ?? 2000;
  const steps  = p.steps  ?? 50;
  const dt     = p.T / steps;
  const disc   = Math.exp(-p.r * p.T);

  // Half-life: how long it takes for a deviation from θ to halve
  // This is the most intuitive way to explain κ to non-quants
  const halfLife = Math.log(2) / p.kappa;

  // Analytical forward price under OU — E[S(T)] under risk-neutral measure
  // The price expected to decay exponentially toward θ over time
  const forwardPrice = p.S * Math.exp(-p.kappa * p.T)
                     + p.theta * (1 - Math.exp(-p.kappa * p.T));

  // Analytical terminal standard deviation — σ_T
  // As T → ∞: σ_T → σ/√(2κ)  (stationary distribution)
  // As κ → 0: σ_T → σ√T      (recovers GBM-like behaviour)
  const terminalStdDev = p.sigma
    * Math.sqrt((1 - Math.exp(-2 * p.kappa * p.T)) / (2 * p.kappa));

  const NVIS = 60;
  const paths: number[][] = Array.from({ length: NVIS }, () => [p.S]);
  const terminalPrices: number[] = [];

  let payoffSum = 0;
  let payoffSumSq = 0;

  for (let i = 0; i < N; i++) {
    let S = p.S;

    for (let j = 0; j < steps; j++) {
      // OU discrete step — Euler-Maruyama scheme
      // The κ(θ−S)dt term is the restoring force toward equilibrium
      // The σ√dt·Z term is the random shock (same as GBM diffusion)
      const Z = randNormal();
      S = S + p.kappa * (p.theta - S) * dt + p.sigma * Math.sqrt(dt) * Z;
    }

    terminalPrices.push(S);
    if (i < NVIS) {
      // Regenerate the path for visualisation
      // (We need to store each step, not just terminal)
    }

    const payoff = p.isCall
      ? Math.max(S - p.K, 0)
      : Math.max(p.K - S, 0);

    payoffSum   += payoff;
    payoffSumSq += payoff * payoff;
  }

  // Regenerate visualisation paths separately (60 full paths)
  for (let i = 0; i < NVIS; i++) {
    let S = p.S;
    for (let j = 0; j < steps; j++) {
      S = S + p.kappa * (p.theta - S) * dt + p.sigma * Math.sqrt(dt) * randNormal();
      paths[i].push(S);
    }
  }

  const mean     = payoffSum / N;
  const variance = payoffSumSq / N - mean * mean;
  const stdErr   = Math.sqrt(variance / N);

  const price = disc * mean;
  const se    = disc * stdErr;

  return {
    price,
    stdError: se,
    ci95: [price - 1.96 * se, price + 1.96 * se],
    paths,
    terminalPrices,
    halfLife,
    forwardPrice,
    terminalStdDev,
  };
}

// ── OU Scenario Analysis ──────────────────────────────────────────────────
// Computes expected carbon price at multiple future horizons.
// Useful for treasury planning: "what is our expected EUA cost in 6, 12, 24 months?"

export interface OUScenario {
  horizon: number;       // years
  expectedPrice: number; // E[S(T)]
  stdDev: number;        // σ_T
  upper95: number;       // 95th percentile
  lower05: number;       // 5th percentile
}

export function ouScenarios(
  S: number, kappa: number, theta: number, sigma: number,
  horizons: number[] = [0.25, 0.5, 1, 2, 3]
): OUScenario[] {
  return horizons.map(T => {
    const mu = S * Math.exp(-kappa * T) + theta * (1 - Math.exp(-kappa * T));
    const sd = sigma * Math.sqrt((1 - Math.exp(-2 * kappa * T)) / (2 * kappa));
    return {
      horizon:       T,
      expectedPrice: mu,
      stdDev:        sd,
      upper95:       mu + 1.645 * sd,   // one-sided 95th percentile
      lower05:       mu - 1.645 * sd,   // one-sided 5th percentile
    };
  });
}