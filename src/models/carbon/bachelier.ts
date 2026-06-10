// ── Bachelier Model — Analytical Option Pricing Under OU ──────────────────
// The Bachelier model (1900) is the closed-form solution for a European
// option when the underlying follows the Ornstein-Uhlenbeck process.
// It predates Black-Scholes by 73 years and assumes normally distributed
// prices (rather than log-normally distributed as in BS).
//
// For a carbon EUA option under the OU process:
//
//   Call = disc × [ (F − K)·Φ(d) + σ_T·φ(d) ]
//   Put  = disc × [ (K − F)·Φ(−d) + σ_T·φ(−d) ]
//
// where:
//   F     = E[S(T)] = S·e^{−κT} + θ·(1−e^{−κT})  (OU forward price)
//   σ_T   = σ·√[(1−e^{−2κT})/(2κ)]               (terminal std deviation)
//   d     = (F − K) / σ_T                          (standardised moneyness)
//   disc  = e^{−rT}                                (risk-neutral discount)
//
// WHY BACHELIER AND NOT BLACK-SCHOLES FOR CARBON?
// Black-Scholes assumes GBM: prices grow on average, never mean-revert,
// and have log-normal distribution. For equity indices, this is reasonable.
// For carbon permits, the regulatory cap creates a gravity toward equilibrium.
// Bachelier-OU captures this — the forward price F is always pulled toward θ,
// and σ_T saturates at σ/√(2κ) rather than growing with √T indefinitely.
// For long-dated EUA options (T > 2 years), the pricing difference is material.
//
// CONNECTION TO YOUR BACKGROUND:
// The Bachelier model produces normally distributed terminal prices — the same
// distributional assumption used in your IFRS 9 stress testing when applying
// additive scenario shocks to credit metrics. GBM produces log-normal terminal
// prices — multiplicative shocks. The choice of distributional assumption
// drives very different tail behaviour in stress scenarios.

import { Phi, phi } from '../../core/distributions';
import type { OUParams } from './ornsteinUhlenbeck';

// ── Types ─────────────────────────────────────────────────────────────────

export interface BachelierResult {
  price: number;
  forwardPrice: number;    // F = E[S(T)] under OU
  terminalStdDev: number;  // σ_T — dispersion of terminal price
  d: number;               // standardised moneyness
  intrinsic: number;       // max(F−K, 0) — value if σ=0
  timeValue: number;       // price − intrinsic
}

export interface BachelierGreeks {
  delta: number;    // ∂V/∂S — hedge ratio (units: 1/€ of price move)
  gamma: number;    // ∂²V/∂S² — rate of change of delta
  vega: number;     // ∂V/∂σ ÷ 1 — per unit vol move (not per %)
  theta: number;    // Daily time decay (∂V/∂t ÷ 365)
  kappaSens: number;  // ∂V/∂κ — sensitivity to mean-reversion speed
  thetaSens: number;  // ∂V/∂θ — sensitivity to long-run equilibrium
}

// ── Core Bachelier Computation ────────────────────────────────────────────

function bachelierCore(p: OUParams): { F: number; sigmaT: number; d: number; disc: number } {
  // OU forward price: mean-reverts from S toward θ over time T
  const F = p.S * Math.exp(-p.kappa * p.T)
           + p.theta * (1 - Math.exp(-p.kappa * p.T));

  // Terminal standard deviation — saturates rather than growing indefinitely
  const sigmaT = p.sigma
    * Math.sqrt((1 - Math.exp(-2 * p.kappa * p.T)) / (2 * p.kappa));

  const d    = sigmaT > 1e-10 ? (F - p.K) / sigmaT : 0;
  const disc = Math.exp(-p.r * p.T);

  return { F, sigmaT, d, disc };
}

// ── Bachelier Price ───────────────────────────────────────────────────────

export function bachelierPrice(p: OUParams): BachelierResult {
  if (p.T < 1e-9) {
    const intrinsic = p.isCall ? Math.max(p.S - p.K, 0) : Math.max(p.K - p.S, 0);
    return { price: intrinsic, forwardPrice: p.S, terminalStdDev: 0, d: 0, intrinsic, timeValue: 0 };
  }

  const { F, sigmaT, d, disc } = bachelierCore(p);

  let price: number;
  if (p.isCall) {
    // Call = disc × [(F−K)·Φ(d) + σ_T·φ(d)]
    price = disc * ((F - p.K) * Phi(d) + sigmaT * phi(d));
  } else {
    // Put = disc × [(K−F)·Φ(−d) + σ_T·φ(−d)]
    price = disc * ((p.K - F) * Phi(-d) + sigmaT * phi(-d));
  }

  const intrinsic  = disc * (p.isCall ? Math.max(F - p.K, 0) : Math.max(p.K - F, 0));
  const timeValue  = Math.max(price - intrinsic, 0);

  return { price, forwardPrice: F, terminalStdDev: sigmaT, d, intrinsic, timeValue };
}

// ── Bachelier Greeks — Finite Difference ─────────────────────────────────
// Greeks are computed by finite difference (bumping each parameter
// and observing the price change) rather than analytically.
//
// This approach is:
// 1. Numerically equivalent to analytical Greeks for smooth models
// 2. Easier to extend to models where analytical Greeks are unavailable
// 3. A standard technique in production risk systems for complex models
//
// This is the same finite-difference bumping used in IFRS 9 sensitivity
// analysis — compute ECL, bump a parameter by a small amount, recompute.

export function bachelierGreeks(p: OUParams): BachelierGreeks {
  const base = bachelierPrice(p).price;

  const bump = (key: keyof OUParams, h: number): number => {
    const bumped = { ...p, [key]: (p[key] as number) + h };
    return bachelierPrice(bumped).price;
  };

  // Delta: per €1 change in current carbon price
  const dS    = 0.01;
  const delta = (bump('S', dS) - bump('S', -dS)) / (2 * dS);
  const gamma = (bump('S', dS) - 2 * base + bump('S', -dS)) / (dS * dS);

  // Vega: per €1 change in absolute volatility
  const dSig = 0.1;
  const vega = (bump('sigma', dSig) - bump('sigma', -dSig)) / (2 * dSig);

  // Theta: daily P&L from time passing (T decreases by 1/365)
  const dT    = 1 / 365;
  const theta = p.T > dT
    ? (bachelierPrice({ ...p, T: p.T - dT }).price - base)
    : 0;

  // κ sensitivity: per unit change in mean-reversion speed
  const dk       = 0.01;
  const kappaSens = (bump('kappa', dk) - bump('kappa', -dk)) / (2 * dk);

  // θ sensitivity: per €1 change in long-run equilibrium price
  const dTh      = 0.5;
  const thetaSens = (bump('theta', dTh) - bump('theta', -dTh)) / (2 * dTh);

  return { delta, gamma, vega, theta, kappaSens, thetaSens };
}

// ── Model Comparison ──────────────────────────────────────────────────────
// Computes both Black-Scholes and Bachelier prices for the same parameters
// to show the divergence — the core argument for why better models matter.

import { bsPrice } from '../../core/blackScholes';

export interface ModelComparison {
  bachelierPrice: number;
  blackScholesPrice: number;
  difference: number;
  differencePercent: number;
  note: string;
}

export function compareModels(p: OUParams): ModelComparison {
  const bach = bachelierPrice(p).price;

  // Map OU params to BS params — use sigma as percentage vol
  // relative to current spot for a rough comparison
  const bsEquivalent = bsPrice({
    S: p.S, K: p.K, T: p.T, r: p.r,
    sigma: p.sigma / p.S,  // convert absolute vol to percentage
    isCall: p.isCall,
  });

  const diff    = bach - bsEquivalent;
  const diffPct = bsEquivalent > 0 ? (diff / bsEquivalent) * 100 : 0;

  return {
    bachelierPrice:      bach,
    blackScholesPrice:   bsEquivalent,
    difference:          diff,
    differencePercent:   diffPct,
    note: Math.abs(diffPct) > 5
      ? 'Material difference — model choice matters for this configuration'
      : 'Models converge — parameters are in range where both are similar',
  };
}