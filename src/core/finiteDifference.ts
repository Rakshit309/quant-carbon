// ── Crank-Nicolson Finite Difference Method ───────────────────────────────
// The FDM solves the Black-Scholes PDE directly on a discrete grid.
// Instead of simulating paths (Monte Carlo) or using a formula (BS),
// it works backwards from the known payoff at expiry to today's price.
//
// The Black-Scholes PDE in terms of time-to-maturity τ = T − t:
//   ∂V/∂τ = ½σ²S²·∂²V/∂S² + rS·∂V/∂S − rV
//
// ANALOGY: Think of this like a heat equation.
// Imagine the option payoff at expiry as an initial temperature distribution
// along a metal rod (the S axis). The PDE describes how that heat spreads
// backwards through time. The FDM discretises the rod into grid points
// and marches the temperature backwards step by step.
//
// CRANK-NICOLSON vs EXPLICIT:
// Explicit scheme: each grid point uses only the current time step.
//   Fast but conditionally unstable — blows up if dt is too large.
// Implicit scheme: each grid point uses the next time step.
//   Always stable but requires solving a linear system.
// Crank-Nicolson: averages both — unconditionally stable AND
//   second-order accurate in both space and time. Industry standard.
//
// CONNECTION TO YOUR BACKGROUND:
// The Thomas algorithm below is a tridiagonal matrix solver — O(N) time.
// The governance parallel: just as your data lineage work ensured every
// output traced to a named input, the FDM grid ensures every price
// traces to specific boundary conditions and PDE coefficients.
// The boundary conditions ARE the model assumptions made explicit.

export interface FDMParams {
  S: number;       // Current spot price
  K: number;       // Strike price
  T: number;       // Time to maturity in years
  r: number;       // Risk-free rate
  sigma: number;   // Volatility
  isCall: boolean;
  Ns?: number;     // Grid points in S direction (default 100)
  Nt?: number;     // Time steps (default 500)
}

// ── Thomas Algorithm ──────────────────────────────────────────────────────
// Solves a tridiagonal linear system Ax = b in O(N) time.
// At each time step, Crank-Nicolson produces exactly this structure:
// each interior grid point only connects to its two immediate neighbours.
//
// This sparsity is not an accident — it reflects the local nature of
// the PDE: the price at grid point i depends only on i-1, i, and i+1.
// This is the financial equivalent of Markov property — only the
// current state matters, not the full history.
function thomasSolve(
  lower: Float64Array,   // sub-diagonal:  coefficient of x[i-1]
  diag: Float64Array,    // main diagonal: coefficient of x[i]
  upper: Float64Array,   // super-diagonal: coefficient of x[i+1]
  rhs: Float64Array      // right-hand side vector b
): Float64Array {
  const n = diag.length;
  const d = new Float64Array(diag); // copy — Thomas modifies in place
  const f = new Float64Array(rhs);

  // Forward sweep — eliminate lower diagonal
  for (let j = 1; j < n; j++) {
    const w = lower[j] / d[j - 1];
    d[j] -= w * upper[j - 1];
    f[j] -= w * f[j - 1];
  }

  // Back substitution — solve from bottom up
  const x = new Float64Array(n);
  x[n - 1] = f[n - 1] / d[n - 1];
  for (let j = n - 2; j >= 0; j--) {
    x[j] = (f[j] - upper[j] * x[j + 1]) / d[j];
  }

  return x;
}

// ── Crank-Nicolson Pricer ─────────────────────────────────────────────────
export function crankNicolsonPrice(p: FDMParams): number {
  const Ns = p.Ns ?? 100;   // spatial grid points
  const Nt = p.Nt ?? 500;   // time steps
  const Smax = 3 * p.K;     // upper boundary: 3× strike is deep ITM
  const dS = Smax / Ns;     // spatial step size
  const dt = p.T / Nt;      // time step size
  const m = Ns - 1;         // number of interior points

  // ── Precompute LHS tridiagonal coefficients ──────────────────────────
  // The CN scheme produces the same LHS matrix at every time step
  // (coefficients depend only on grid position, not on time).
  // Computing once and reusing is a significant performance gain.
  //
  // For interior grid point i (S_i = i·dS), the PDE discretises to:
  //   p_i = ½σ²i² − ½ri   (coefficient of V_{i-1})
  //   q_i = −(σ²i² + r)   (coefficient of V_i)
  //   s_i = ½σ²i² + ½ri   (coefficient of V_{i+1})
  //
  // CN LHS coefficients (implicit half-step):
  //   lower[j] = −dt/2 · p_i
  //   diag[j]  =  1 − dt/2 · q_i
  //   upper[j] = −dt/2 · s_i

  const lower = new Float64Array(m);
  const diag  = new Float64Array(m);
  const upper = new Float64Array(m);

  for (let j = 0; j < m; j++) {
    const i = j + 1;
    const a = 0.25 * dt * (p.sigma * p.sigma * i * i - p.r * i);
    const b = -0.5 * dt * (p.sigma * p.sigma * i * i + p.r);
    const c = 0.25 * dt * (p.sigma * p.sigma * i * i + p.r * i);
    lower[j] = -a;
    diag[j]  = 1 - b;
    upper[j] = -c;
  }

  // ── Initial condition: option payoff at expiry (τ = 0) ───────────────
  // This is the starting temperature distribution on the rod.
  // For a call: max(S − K, 0) — zero below K, linear above K
  // For a put:  max(K − S, 0) — linear below K, zero above K
  let V = new Float64Array(Ns + 1);
  for (let i = 0; i <= Ns; i++) {
    const Si = i * dS;
    V[i] = p.isCall
      ? Math.max(Si - p.K, 0)
      : Math.max(p.K - Si, 0);
  }

  // ── March backwards through time ─────────────────────────────────────
  for (let step = 0; step < Nt; step++) {
    const tau = (step + 1) * dt; // current time-to-maturity

    // Boundary conditions at this time step
    // These encode the model assumptions at the extremes of S:
    // Call: worthless at S=0, equals Smax − K·e^{−rτ} at S=Smax
    // Put:  equals K·e^{−rτ} at S=0 (maximum value), worthless at Smax
    const V0 = p.isCall ? 0 : p.K * Math.exp(-p.r * tau);
    const VN = p.isCall
      ? Math.max(Smax - p.K * Math.exp(-p.r * tau), 0)
      : 0;

    // Build RHS: explicit half-step using current V values
    const rhs = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const i = j + 1;
      const a = 0.25 * dt * (p.sigma * p.sigma * i * i - p.r * i);
      const b = -0.5 * dt * (p.sigma * p.sigma * i * i + p.r);
      const c = 0.25 * dt * (p.sigma * p.sigma * i * i + p.r * i);
      const Vim1 = i === 1      ? V[0]  : V[i - 1];
      const Vip1 = i === Ns - 1 ? V[Ns] : V[i + 1];
      rhs[j] = a * Vim1 + (1 + b) * V[i] + c * Vip1;
    }

    // Boundary corrections: move known boundary values to RHS
    rhs[0]     += 0.25 * dt * (p.sigma * p.sigma - p.r) * V0;
    rhs[m - 1] += 0.25 * dt *
      (p.sigma * p.sigma * (Ns - 1) * (Ns - 1) + p.r * (Ns - 1)) * VN;

    // Solve the tridiagonal system
    const x = thomasSolve(lower, diag, upper, rhs);

    // Update grid: apply non-negativity constraint
    V[0]  = V0;
    V[Ns] = VN;
    for (let j = 0; j < m; j++) {
      V[j + 1] = Math.max(x[j], 0);
    }
  }

  // ── Interpolate at current spot price S ──────────────────────────────
  // S almost never falls exactly on a grid point, so we linearly
  // interpolate between the two nearest grid points.
  const idx  = p.S / dS;
  const i    = Math.min(Math.floor(idx), Ns - 1);
  const frac = idx - i;
  return V[i] * (1 - frac) + V[i + 1] * frac;
}