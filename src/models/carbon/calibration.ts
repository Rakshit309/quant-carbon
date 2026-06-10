// ── OU Parameter Calibration from Historical Carbon Prices ────────────────
// Estimates κ, θ, σ from observed EU ETS price data using
// Ordinary Least Squares regression on the discrete OU process.
//
// The OU process in discrete time is a linear AR(1) model:
//   S(t+dt) = α + β·S(t) + ε
//
// OLS recovers α and β. The OU parameters follow algebraically:
//   β  = e^{−κ·dt}           κ = −ln(β)/dt
//   α  = θ·(1−β)             θ = α/(1−β)
//   σ² = var(ε)·2κ/(1−β²)   σ = √(var(ε)·2κ/(1−β²))
//
// CONNECTION TO YOUR BACKGROUND:
// This is exactly the same linear regression framework used to estimate
// PD term structure models in IFRS 9 — regressing observed default rates
// against lagged values to extract mean-reversion speed and equilibrium.
// The mathematics is identical. The domain is different.
//
// SAMPLE DATA:
// Approximate monthly EU ETS (EUA) front-month futures prices 2021–2024.
// Source: ICE Endex EUA Dec contract, month-end closes (€/tonne).
// Production systems would ingest live data via Bloomberg or ICE APIs.

export interface OUCalibration {
  kappa: number;       // Mean-reversion speed (per year)
  theta: number;       // Long-run equilibrium (€/tonne)
  sigma: number;       // Absolute volatility (€/tonne per √year)
  halfLifeDays: number; // ln(2)/κ expressed in calendar days
  rSquared: number;    // Goodness of fit — how well OU explains the data
  nObservations: number;
  sampleMean: number;  // Historical mean of the price series
  sampleStdDev: number; // Historical std dev of the price series
}

export interface BacktestResult {
  mae: number;           // Mean Absolute Error (€/tonne)
  rmse: number;          // Root Mean Squared Error (€/tonne)
  rSquared: number;      // R² of 1-step-ahead predictions
  maxError: number;      // Worst single-step prediction error
  meanError: number;     // Bias: positive = model over-predicts
  residuals: number[];   // Raw prediction errors for diagnostic plots
}

// ── Sample EU ETS Price Data ──────────────────────────────────────────────
// Monthly EUA front-month futures prices (€/tonne), Jan 2021 – Dec 2024
// These are approximate month-end values from ICE exchange data.
// Replace with live data feed in production.
export const SAMPLE_EUA_PRICES: number[] = [
  // 2021
  33.2, 37.8, 41.5, 44.1, 50.3, 52.4,
  55.1, 57.6, 62.3, 60.1, 65.4, 79.8,
  // 2022
  81.5, 90.2, 64.8, 70.1, 72.3, 54.9,
  68.2, 68.5, 65.1, 67.8, 74.6, 84.9,
  // 2023
  87.6, 94.8, 92.5, 89.3, 87.8, 86.5,
  92.8, 87.4, 84.2, 75.6, 64.9, 65.8,
  // 2024
  61.5, 57.8, 54.6, 58.2, 69.8, 69.5,
  67.8, 64.9, 61.7, 64.8, 65.9, 67.4,
];

// Monthly time step in years
export const MONTHLY_DT = 1 / 12;

// ── Core OLS Functions ────────────────────────────────────────────────────

// Simple OLS: regress y on x, return {alpha, beta, rSquared, residuals}
function ols(x: number[], y: number[]): {
  alpha: number; beta: number; rSquared: number; residuals: number[]
} {
  const n = x.length;
  if (n < 3) throw new Error('Need at least 3 observations for OLS');

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - xMean) * (y[i] - yMean);
    sxx += (x[i] - xMean) * (x[i] - xMean);
  }

  const beta  = sxy / sxx;
  const alpha = yMean - beta * xMean;

  const residuals = y.map((yi, i) => yi - (alpha + beta * x[i]));
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { alpha, beta, rSquared, residuals };
}

// ── Primary Calibration Function ──────────────────────────────────────────

export function calibrateOU(
  prices: number[],
  dt: number = MONTHLY_DT
): OUCalibration {
  if (prices.length < 4) {
    throw new Error('Minimum 4 price observations required for calibration');
  }

  // Build lagged series: x = S(t), y = S(t+dt)
  const x = prices.slice(0, -1);  // S(t)
  const y = prices.slice(1);      // S(t+dt)

  const { alpha, beta, rSquared, residuals } = ols(x, y);

  // Guard against non-mean-reverting estimate (beta >= 1 implies explosive)
  // In practice, short samples can produce this — clamp for stability
  const betaClamped = Math.min(Math.max(beta, 0.01), 0.9999);

  // Recover OU parameters from OLS coefficients
  const kappa = -Math.log(betaClamped) / dt;
  const theta = alpha / (1 - betaClamped);

  // Sigma from residual variance
  const resVariance = residuals.reduce((s, r) => s + r * r, 0) / residuals.length;
  const sigma = Math.sqrt(resVariance * 2 * kappa / (1 - betaClamped ** 2));

  // Descriptive statistics on the original series
  const n = prices.length;
  const sampleMean = prices.reduce((s, v) => s + v, 0) / n;
  const sampleStdDev = Math.sqrt(
    prices.reduce((s, v) => s + (v - sampleMean) ** 2, 0) / (n - 1)
  );

  return {
    kappa,
    theta,
    sigma,
    halfLifeDays: (Math.log(2) / kappa) * 365,
    rSquared,
    nObservations: n,
    sampleMean,
    sampleStdDev,
  };
}

// ── Model Validation / Back-test ──────────────────────────────────────────
// Tests how well the calibrated OU model predicts 1-step-ahead prices.
// This is the equivalent of your IFRS 9 model back-testing —
// comparing model predictions against realised outcomes.

export function backtestOU(
  prices: number[],
  params: OUCalibration,
  dt: number = MONTHLY_DT
): BacktestResult {
  const predicted: number[] = [];
  const actuals:   number[] = [];

  // 1-step-ahead prediction: E[S(t+dt)] = S(t)·e^{−κdt} + θ·(1−e^{−κdt})
  for (let i = 0; i < prices.length - 1; i++) {
    const decay = Math.exp(-params.kappa * dt);
    const pred  = prices[i] * decay + params.theta * (1 - decay);
    predicted.push(pred);
    actuals.push(prices[i + 1]);
  }

  const errors    = actuals.map((a, i) => a - predicted[i]);
  const absErrors = errors.map(Math.abs);
  const n = errors.length;

  const mae  = absErrors.reduce((s, e) => s + e, 0) / n;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const maxError = Math.max(...absErrors);
  const meanError = errors.reduce((s, e) => s + e, 0) / n;

  const actMean = actuals.reduce((s, v) => s + v, 0) / n;
  const ssTot = actuals.reduce((s, v) => s + (v - actMean) ** 2, 0);
  const ssRes = errors.reduce((s, e) => s + e * e, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { mae, rmse, rSquared, maxError, meanError, residuals: errors };
}

// ── Rolling Calibration ───────────────────────────────────────────────────
// Calibrates OU parameters on a rolling window to check parameter stability.
// Stable κ and θ across windows validates the model choice.
// Unstable parameters suggest regime changes — important for risk management.

export interface RollingCalibrationPoint {
  windowEnd: number;     // Index of last observation in window
  kappa: number;
  theta: number;
  sigma: number;
  rSquared: number;
}

export function rollingCalibration(
  prices: number[],
  windowSize: number = 24,  // 24 months default
  dt: number = MONTHLY_DT
): RollingCalibrationPoint[] {
  const results: RollingCalibrationPoint[] = [];

  for (let end = windowSize; end <= prices.length; end++) {
    const window = prices.slice(end - windowSize, end);
    try {
      const cal = calibrateOU(window, dt);
      results.push({
        windowEnd: end - 1,
        kappa:     cal.kappa,
        theta:     cal.theta,
        sigma:     cal.sigma,
        rSquared:  cal.rSquared,
      });
    } catch {
      // Skip windows that fail calibration
    }
  }

  return results;
}

// ── Convenience: Calibrate and Summarise ─────────────────────────────────
export interface CalibrationSummary {
  params: OUCalibration;
  backtest: BacktestResult;
  interpretation: {
    halfLifeMonths: string;
    equilibriumRange: string;
    modelFitQuality: string;
    recommendedUse: string;
  };
}

export function calibrateAndSummarise(
  prices: number[] = SAMPLE_EUA_PRICES,
  dt: number = MONTHLY_DT
): CalibrationSummary {
  const params   = calibrateOU(prices, dt);
  const backtest = backtestOU(prices, params, dt);

  const halfLifeMonths = (params.halfLifeDays / 30.44).toFixed(1);
  const lower = (params.theta - 1.645 * params.sigma / Math.sqrt(2 * params.kappa)).toFixed(1);
  const upper = (params.theta + 1.645 * params.sigma / Math.sqrt(2 * params.kappa)).toFixed(1);
  const fitQuality = backtest.rSquared > 0.9 ? 'Strong'
                   : backtest.rSquared > 0.7 ? 'Moderate'
                   : 'Weak — consider regime-specific calibration';

  return {
    params,
    backtest,
    interpretation: {
      halfLifeMonths: `${halfLifeMonths} months — deviations from equilibrium halve in this time`,
      equilibriumRange: `€${lower}–€${upper}/tonne (90% stationary interval)`,
      modelFitQuality: `${fitQuality} (R²=${(backtest.rSquared * 100).toFixed(1)}%)`,
      recommendedUse: params.kappa > 0.1 && params.rSquared > 0.7
        ? 'Ready for production pricing'
        : 'Review data quality or increase sample size',
    },
  };
}