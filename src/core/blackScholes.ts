// ── Black-Scholes Pricing Engine ──────────────────────────────────────────
// The Black-Scholes formula prices European options under the assumption
// that the underlying follows Geometric Brownian Motion (GBM):
//   dS = rS·dt + σS·dW
//
// The formula is derived by constructing a riskless portfolio (delta hedge)
// and applying the no-arbitrage condition. The resulting PDE:
//   ∂V/∂t + ½σ²S²·∂²V/∂S² + rS·∂V/∂S − rV = 0
// has an analytical solution — the Black-Scholes formula below.
//
// CONNECTION TO YOUR CREDIT RISK BACKGROUND:
// The d1 and d2 terms are structurally identical to the Distance to Default
// in Merton's model. d2 is literally the number of standard deviations the
// log forward price is above the strike — the same concept as a z-score
// in your PD models. Phi(d2) under risk-neutral measure = probability of
// expiring ITM = conceptual equivalent of (1 - PD) at the option horizon.

import { Phi, phi } from './distributions';

// ── Types ─────────────────────────────────────────────────────────────────

export interface BSParams {
  S: number;      // Current spot price
  K: number;      // Strike price
  T: number;      // Time to maturity in years
  r: number;      // Risk-free rate (annualised, continuously compounded)
  sigma: number;  // Volatility (annualised)
  isCall: boolean;
}

export interface BSResult {
  price: number;
  d1: number;
  d2: number;
}

export interface Greeks {
  delta: number;  // ∂V/∂S       — sensitivity to spot price
  gamma: number;  // ∂²V/∂S²     — rate of change of delta
  vega: number;   // ∂V/∂σ ÷ 100 — sensitivity to volatility
  theta: number;  // ∂V/∂t ÷ 365 — daily time decay
  rho: number;    // ∂V/∂r ÷ 100 — sensitivity to interest rate
}

// ── Core Calculation ──────────────────────────────────────────────────────

// Computes d1 and d2 — the standardised log-price ratios that appear
// in both the price formula and every Greek.
function computeD1D2(p: BSParams): { d1: number; d2: number; sqrtT: number; discount: number } {
  const sqrtT = Math.sqrt(p.T);
  const d1 =
    (Math.log(p.S / p.K) + (p.r + 0.5 * p.sigma * p.sigma) * p.T)
    / (p.sigma * sqrtT);
  const d2 = d1 - p.sigma * sqrtT;
  const discount = Math.exp(-p.r * p.T);
  return { d1, d2, sqrtT, discount };
}

// ── Price ─────────────────────────────────────────────────────────────────

export function bsPrice(p: BSParams): number {
  // At expiry, return intrinsic value immediately
  if (p.T < 1e-9) {
    return p.isCall
      ? Math.max(p.S - p.K, 0)
      : Math.max(p.K - p.S, 0);
  }

  const { d1, d2, discount } = computeD1D2(p);

  if (p.isCall) {
    // Call = S·Φ(d1) − K·e^{−rT}·Φ(d2)
    return p.S * Phi(d1) - p.K * discount * Phi(d2);
  } else {
    // Put = K·e^{−rT}·Φ(−d2) − S·Φ(−d1)
    // Put-Call parity: Put = Call − S + K·e^{−rT}
    return p.K * discount * Phi(-d2) - p.S * Phi(-d1);
  }
}

// ── Greeks ────────────────────────────────────────────────────────────────
// Greeks are the partial derivatives of the option price with respect
// to each input parameter. They are the risk sensitivities — the
// exact equivalent of your ECL sensitivities to PD, LGD, macro factors.
//
// Gamma and Vega are identical for calls and puts (put-call parity).
// Delta, Theta, and Rho differ by sign between calls and puts.

export function bsGreeks(p: BSParams): Greeks {
  if (p.T < 1e-9) {
    return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }

  const { d1, d2, sqrtT, discount } = computeD1D2(p);
  const phiD1 = phi(d1);

  // Gamma: identical for calls and puts
  // Measures how quickly your hedge (delta) goes stale
  const gamma = phiD1 / (p.S * p.sigma * sqrtT);

  // Vega: identical for calls and puts, divided by 100 (per 1% vol move)
  // A $10 vega means the option gains $10 per 1% increase in volatility
  const vega = (p.S * phiD1 * sqrtT) / 100;

  if (p.isCall) {
    const delta = Phi(d1);
    // Theta divided by 365 gives daily time decay in dollar terms
    const theta =
      (-p.S * phiD1 * p.sigma / (2 * sqrtT)
      - p.r * p.K * discount * Phi(d2)) / 365;
    // Rho divided by 100 gives sensitivity per 1% rate move
    const rho = (p.K * p.T * discount * Phi(d2)) / 100;
    return { delta, gamma, vega, theta, rho };
  } else {
    const delta = Phi(d1) - 1;
    const theta =
      (-p.S * phiD1 * p.sigma / (2 * sqrtT)
      + p.r * p.K * discount * Phi(-d2)) / 365;
    const rho = (-p.K * p.T * discount * Phi(-d2)) / 100;
    return { delta, gamma, vega, theta, rho };
  }
}