// ── Monte Carlo Simulation Engine ─────────────────────────────────────────
// Monte Carlo prices options by simulating thousands of possible future
// price paths and averaging the discounted payoffs.
//
// The underlying process is Geometric Brownian Motion (GBM):
//   S(t+dt) = S(t) · exp((r − ½σ²)·dt + σ·√dt·Z)
// where Z ~ N(0,1) is a standard normal random variable.
//
// The (r − ½σ²) drift term is the Itô correction — this is the key
// difference between GBM and a simple random walk. Because we are
// working with log-prices (multiplicative returns), the variance of
// the process introduces a −½σ² adjustment to preserve the correct
// expected value under the risk-neutral measure.
//
// CONNECTION TO YOUR CREDIT RISK BACKGROUND:
// This is structurally identical to the stochastic runs you validated
// at NN Group for IFRS 17. Those runs simulated future liability values
// under risk-neutral measure — this simulates future asset prices under
// risk-neutral measure. The mathematical framework is the same.
// The risk-neutral measure means drift = r (risk-free rate), not the
// real-world expected return. This is the Q-measure vs P-measure
// distinction: pricing uses Q, VaR uses P.

export interface MCParams {
  S: number;       // Current spot price
  K: number;       // Strike price
  T: number;       // Time to maturity in years
  r: number;       // Risk-free rate
  sigma: number;   // Volatility
  isCall: boolean;
  N?: number;      // Number of paths (default 2000)
  steps?: number;  // Time steps per path (default 40)
}

export interface MCResult {
  price: number;        // Estimated option price
  stdError: number;     // Standard error of the estimate
  ci95: [number, number]; // 95% confidence interval [lower, upper]
  paths: number[][];    // Sample paths for visualisation (first 60)
  terminalPrices: number[]; // All terminal prices for distribution plot
}

// ── Box-Muller Polar Transform ────────────────────────────────────────────
// Generates a standard normal random variable from two uniform randoms.
// The polar form is used (not the basic form) because it avoids the
// instability of log(0) and is faster on average.
//
// This is the same random number generation used in the IFRS 17
// stochastic liability models — every risk-neutral simulation uses
// a variant of this transform.
function randNormal(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

// ── Monte Carlo Pricer ────────────────────────────────────────────────────
export function monteCarloPricer(p: MCParams): MCResult {
  const N = p.N ?? 2000;
  const steps = p.steps ?? 40;
  const dt = p.T / steps;

  // Risk-neutral drift per step — this is the Q-measure drift
  // r is the risk-free rate, not the real-world equity risk premium
  // The −½σ²dt is the Itô correction for the log-price process
  const drift = (p.r - 0.5 * p.sigma * p.sigma) * dt;
  const vol = p.sigma * Math.sqrt(dt);
  const discount = Math.exp(-p.r * p.T);

  const NVIS = 60; // number of paths to store for visualisation
  const paths: number[][] = Array.from({ length: NVIS }, () => [p.S]);
  const terminalPrices: number[] = [];

  let payoffSum = 0;
  let payoffSumSquared = 0;

  for (let i = 0; i < N; i++) {
    let S = p.S;

    for (let j = 0; j < steps; j++) {
      // GBM step: multiplicative log-normal increment
      S = S * Math.exp(drift + vol * randNormal());

      // Store path for visualisation (only first NVIS paths)
      if (i < NVIS) {
        paths[i].push(S);
      }
    }

    terminalPrices.push(S);

    // Compute payoff at expiry
    const payoff = p.isCall
      ? Math.max(S - p.K, 0)
      : Math.max(p.K - S, 0);

    payoffSum += payoff;
    payoffSumSquared += payoff * payoff;
  }

  // ── Statistics ───────────────────────────────────────────────────────
  // The MC price is the discounted expected payoff — E[payoff] × e^{−rT}
  // Standard error shrinks as 1/√N — doubling accuracy costs 4× paths
  const meanPayoff = payoffSum / N;
  const variance = payoffSumSquared / N - meanPayoff * meanPayoff;
  const stdError = Math.sqrt(variance / N);

  const price = discount * meanPayoff;
  const se = discount * stdError;

  return {
    price,
    stdError: se,
    ci95: [price - 1.96 * se, price + 1.96 * se],
    paths,
    terminalPrices,
  };
}