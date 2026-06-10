// ── Normal Distribution Functions ─────────────────────────────────────────
// These are the mathematical foundation of Black-Scholes pricing.
// Phi (Φ) is the cumulative normal distribution — the probability that a
// standard normal random variable is less than x.
// phi (φ) is the normal probability density function.
//
// CONNECTION TO YOUR CREDIT RISK BACKGROUND:
// Phi(x) is the same function used in Merton's structural credit model —
// the probability that a firm's asset value stays above its debt threshold.
// PD in the KMV model = Phi(-DD) where DD is the Distance to Default.
// You already use this function conceptually in credit. Here it is explicitly.

// Abramowitz & Stegun approximation — accurate to 7 decimal places.
// Used in every production BS pricer because Math has no built-in erf().
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly =
    t * (0.254829592 +
    t * (-0.284496736 +
    t * (1.421413741 +
    t * (-1.453152027 +
    t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

// Cumulative Standard Normal Distribution Φ(x)
// Probability that a standard normal variable takes a value ≤ x
export function Phi(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Standard Normal Probability Density Function φ(x)
// The bell curve — used in Greeks calculations (Gamma, Vega)
export function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ── Random Normal Generator ────────────────────────────────────────────────
// Box-Muller polar transform — generates a standard normal random variable.
// Exported here so all simulation models (equity MC, carbon OU) share
// one implementation. Duplication of random number generators is a
// known source of subtle bugs in quantitative systems.
export function randNormal(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}