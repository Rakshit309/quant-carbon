// ── quant-carbon API ───────────────────────────────────────────────────────
// Hono REST API exposing the pricing engine over HTTP.
// Runs on Cloudflare Workers — zero server management, global edge deployment.
//
// ENDPOINTS:
//   POST /api/price          — Price an option (BS, Bachelier-OU, MC, FDM)
//   POST /api/simulate       — Simulate GBM or OU price paths
//   POST /api/calibrate      — Calibrate OU parameters from price history
//   POST /api/permanence_ecl — Compute carbon credit ECL provisions
//
// AUTHENTICATION:
//   Pass X-API-Key header on all /api/* requests.
//   In development any non-empty string is accepted.

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// ── Core pricing engine ───────────────────────────────────────────────────
import { bsPrice, bsGreeks }      from '../core/blackScholes';
import { monteCarloPricer }       from '../core/monteCarlo';
import { crankNicolsonPrice }     from '../core/finiteDifference';

// ── Carbon models ─────────────────────────────────────────────────────────
import { bachelierPrice, bachelierGreeks } from '../models/carbon/bachelier';
import { ouMonteCarlo, ouScenarios }       from '../models/carbon/ornsteinUhlenbeck';
import {
  calibrateAndSummarise,
  SAMPLE_EUA_PRICES, MONTHLY_DT,
} from '../models/carbon/calibration';
import {
  portfolioECL, scenarioWeightedECL,
  CarbonCredit,
} from '../models/carbon/permanenceRisk';

// ── App ───────────────────────────────────────────────────────────────────
const app = new Hono();

app.use('*', cors({ origin: '*' }));

// ── API key middleware ────────────────────────────────────────────────────
// Protects all /api/* routes. Every request must carry X-API-Key header.
// In development any non-empty key is accepted.
// Production: validate against a stored key registry (Cloudflare KV).
app.use('/api/*', async (c, next) => {
  const key = c.req.header('X-API-Key') ?? c.req.query('api_key');
  if (!key || key.trim() === '') {
    return c.json({
      error:   'Unauthorised',
      message: 'Pass your API key in the X-API-Key header',
      example: 'curl -H "X-API-Key: your-key" ...',
    }, 401);
  }
  await next();
});

// ── GET / ─────────────────────────────────────────────────────────────────
app.get('/', (c) => c.json({
  name:        'quant-carbon',
  version:     '0.1.0',
  status:      'operational',
  description: 'Quantitative pricing engine for carbon and equity derivatives',
  endpoints: {
    'POST /api/price':          'Price options — Black-Scholes, Bachelier-OU, Monte Carlo, FDM',
    'POST /api/simulate':       'Simulate GBM or OU price paths',
    'POST /api/calibrate':      'Calibrate OU parameters from EUA price history',
    'POST /api/permanence_ecl': 'Compute IFRS 9 ECL for carbon credit portfolios',
  },
  models: {
    equity: 'Black-Scholes (analytical) · Monte Carlo GBM · Crank-Nicolson FDM',
    carbon: 'Bachelier-OU (analytical) · Ornstein-Uhlenbeck MC · OLS calibration',
  },
  repository: 'https://github.com/Rakshit309/quant-carbon',
}));

// ── POST /api/price ───────────────────────────────────────────────────────
// The primary endpoint. Prices a European option and returns
// price, Greeks, and a cross-check from a second method.
//
// Request body:
//   model    — "bs" (default) | "bachelier" | "mc" | "fdm"
//   S        — spot price
//   K        — strike price
//   T        — time to maturity (years)
//   r        — risk-free rate (decimal, e.g. 0.05)
//   sigma    — volatility (decimal for BS/MC/FDM, absolute €/tonne for Bachelier)
//   isCall   — true (default) or false
//   kappa    — OU mean-reversion speed (Bachelier only, default 1.0)
//   theta    — OU long-run equilibrium (Bachelier only, default 0.9×S)

app.post('/api/price', async (c) => {
  try {
    const body                  = await c.req.json();
    const { model = 'bs', S, K, T, r, sigma, isCall = true } = body;

    // Input validation
    const missing = ['S','K','T','r','sigma'].filter(k => body[k] === undefined);
    if (missing.length > 0) {
      return c.json({
        error:    'Missing required parameters',
        missing,
        required: ['S','K','T','r','sigma'],
        optional: ['isCall','model','kappa','theta','N','steps'],
      }, 400);
    }

    const moneyness = isCall
      ? (S > K ? 'ITM' : S < K ? 'OTM' : 'ATM')
      : (K > S ? 'ITM' : K < S ? 'OTM' : 'ATM');

    // ── Bachelier-OU (carbon options) ─────────────────────────────────
    if (model === 'bachelier' || model === 'ou') {
      const { kappa = 1.0, theta = S * 0.9 } = body;
      const p = { S, K, T, r, kappa, theta, sigma, isCall };

      const result = bachelierPrice(p);
      const greeks = bachelierGreeks(p);
      const mc     = ouMonteCarlo({ ...p, N: 2000 });

      return c.json({
        price:      +result.price.toFixed(4),
        model:      'bachelier_ou',
        instrument: 'carbon_eua',
        greeks: {
          delta:            +greeks.delta.toFixed(5),
          gamma:            +greeks.gamma.toFixed(5),
          vega:             +greeks.vega.toFixed(5),
          theta:            +greeks.theta.toFixed(5),
          kappaSensitivity: +greeks.kappaSens.toFixed(5),
          thetaSensitivity: +greeks.thetaSens.toFixed(5),
        },
        analytics: {
          forwardPrice:   +result.forwardPrice.toFixed(4),
          terminalStdDev: +result.terminalStdDev.toFixed(4),
          intrinsicValue: +result.intrinsic.toFixed(4),
          timeValue:      +result.timeValue.toFixed(4),
          halfLifeDays:   +(Math.log(2) / kappa * 365).toFixed(1),
          moneyness,
        },
        crossCheck: {
          monteCarlo: +mc.price.toFixed(4),
          ci95:       mc.ci95.map(v => +v.toFixed(4)),
        },
        inputs: { S, K, T, r, sigma, kappa, theta, isCall },
      });
    }

    // ── Monte Carlo GBM ───────────────────────────────────────────────
    if (model === 'mc') {
      const { N = 2000, steps = 50 } = body;
      const mc = monteCarloPricer({ S, K, T, r, sigma, isCall, N, steps });
      return c.json({
        price:      +mc.price.toFixed(4),
        model:      'monte_carlo_gbm',
        stdError:   +mc.stdError.toFixed(5),
        ci95:       mc.ci95.map(v => +v.toFixed(4)),
        analytics:  { moneyness, N, steps },
        inputs:     { S, K, T, r, sigma, isCall },
      });
    }

    // ── Crank-Nicolson FDM ────────────────────────────────────────────
    if (model === 'fdm') {
      const fd = crankNicolsonPrice({ S, K, T, r, sigma, isCall });
      const bs = bsPrice({ S, K, T, r, sigma, isCall });
      return c.json({
        price:      +fd.toFixed(4),
        model:      'crank_nicolson_fdm',
        crossCheck: { blackScholes: +bs.toFixed(4), error: +(Math.abs(fd-bs)).toFixed(5) },
        analytics:  { moneyness, Ns: 100, Nt: 500 },
        inputs:     { S, K, T, r, sigma, isCall },
      });
    }

    // ── Black-Scholes (default) ───────────────────────────────────────
    // Returns price, all 5 Greeks, and cross-checks from MC and FDM.
    const bsP    = bsPrice({ S, K, T, r, sigma, isCall });
    const greeks = bsGreeks({ S, K, T, r, sigma, isCall });
    const mc     = monteCarloPricer({ S, K, T, r, sigma, isCall, N: 2000 });
    const fd     = crankNicolsonPrice({ S, K, T, r, sigma, isCall });

    return c.json({
      price:      +bsP.toFixed(4),
      model:      'black_scholes',
      instrument: 'equity_vanilla',
      greeks: {
        delta: +greeks.delta.toFixed(5),
        gamma: +greeks.gamma.toFixed(5),
        vega:  +greeks.vega.toFixed(5),
        theta: +greeks.theta.toFixed(5),
        rho:   +greeks.rho.toFixed(5),
      },
      crossCheck: {
        monteCarlo:    +mc.price.toFixed(4),
        finDifference: +fd.toFixed(4),
        mcCI95:        mc.ci95.map(v => +v.toFixed(4)),
        maxDivergence: +(Math.max(Math.abs(bsP-mc.price), Math.abs(bsP-fd))).toFixed(4),
      },
      analytics: { moneyness },
      inputs:    { S, K, T, r, sigma, isCall },
    });

  } catch (err) {
    return c.json({ error: 'Pricing failed', detail: String(err) }, 500);
  }
});

// ── POST /api/simulate ────────────────────────────────────────────────────
// Returns simulated price paths for visualisation.
// model: "gbm" (default) or "ou"
app.post('/api/simulate', async (c) => {
  try {
    const body                        = await c.req.json();
    const { model = 'gbm', S, T, r, sigma } = body;

    const missing = ['S','T','r','sigma'].filter(k => body[k] === undefined);
    if (missing.length > 0) {
      return c.json({ error: 'Missing required parameters', missing }, 400);
    }

    if (model === 'ou') {
      const { kappa = 1.0, theta = S, K = S, steps = 50 } = body;
      const result   = ouMonteCarlo({ S, K, T, r, kappa, theta, sigma, isCall: true, N: 60, steps });
      const scenarios = ouScenarios(S, kappa, theta, sigma);

      return c.json({
        model: 'ou',
        paths: result.paths,
        terminalStats: {
          mean:         +result.forwardPrice.toFixed(3),
          stdDev:       +result.terminalStdDev.toFixed(3),
          halfLifeDays: +(result.halfLife * 365).toFixed(1),
        },
        scenarios: scenarios.map(s => ({
          horizon:       s.horizon,
          expectedPrice: +s.expectedPrice.toFixed(3),
          stdDev:        +s.stdDev.toFixed(3),
          upper95:       +s.upper95.toFixed(3),
          lower05:       +s.lower05.toFixed(3),
        })),
        inputs: { S, T, r, sigma, kappa, theta },
      });
    }

    // GBM paths
    const { K = S, steps = 50, isCall = true } = body;
    const result = monteCarloPricer({ S, K, T, r, sigma, isCall, N: 2000, steps });
    const terms  = result.terminalPrices;
    const sorted = [...terms].sort((a, b) => a - b);
    const mean   = terms.reduce((s, v) => s + v, 0) / terms.length;
    const stdDev = Math.sqrt(terms.reduce((s, v) => s + (v - mean) ** 2, 0) / terms.length);

    return c.json({
      model: 'gbm',
      paths: result.paths,
      terminalStats: {
        mean:   +mean.toFixed(3),
        stdDev: +stdDev.toFixed(3),
        p5:     +sorted[Math.floor(sorted.length * 0.05)].toFixed(3),
        p95:    +sorted[Math.floor(sorted.length * 0.95)].toFixed(3),
      },
      inputs: { S, T, r, sigma },
    });

  } catch (err) {
    return c.json({ error: 'Simulation failed', detail: String(err) }, 500);
  }
});

// ── POST /api/calibrate ───────────────────────────────────────────────────
// Calibrates OU parameters from a historical price series using OLS.
// Omit prices to use the built-in 48-month EUA sample dataset.
app.post('/api/calibrate', async (c) => {
  try {
    const body            = await c.req.json();
    const { prices, dt = MONTHLY_DT } = body;
    const priceData       = Array.isArray(prices) && prices.length >= 4
      ? prices : SAMPLE_EUA_PRICES;

    const summary = calibrateAndSummarise(priceData, dt);

    return c.json({
      parameters: {
        kappa:        +summary.params.kappa.toFixed(4),
        theta:        +summary.params.theta.toFixed(4),
        sigma:        +summary.params.sigma.toFixed(4),
        halfLifeDays: +summary.params.halfLifeDays.toFixed(1),
      },
      fit: {
        rSquared:      +summary.params.rSquared.toFixed(4),
        nObservations: summary.params.nObservations,
        sampleMean:    +summary.params.sampleMean.toFixed(3),
        sampleStdDev:  +summary.params.sampleStdDev.toFixed(3),
      },
      backtest: {
        mae:      +summary.backtest.mae.toFixed(4),
        rmse:     +summary.backtest.rmse.toFixed(4),
        rSquared: +summary.backtest.rSquared.toFixed(4),
        maxError: +summary.backtest.maxError.toFixed(4),
        bias:     +summary.backtest.meanError.toFixed(4),
      },
      interpretation:  summary.interpretation,
      dataSource:      Array.isArray(prices) ? 'user_supplied' : 'sample_eua_2021_2024',
      nextStep: 'Pass kappa, theta, sigma to POST /api/price with model: "bachelier"',
    });

  } catch (err) {
    return c.json({ error: 'Calibration failed', detail: String(err) }, 500);
  }
});

// ── POST /api/permanence_ecl ──────────────────────────────────────────────
// Computes IFRS 9 Expected Credit Loss for a carbon credit portfolio.
// Returns per-credit provisions and portfolio-level summary.
app.post('/api/permanence_ecl', async (c) => {
  try {
    const body                            = await c.req.json();
    const { credits, scenarios = false }  = body;

    if (!Array.isArray(credits) || credits.length === 0) {
      return c.json({
        error:   'Provide a credits array',
        example: {
          credits: [{
            id: 'REDD-001', projectType: 'REDD_PLUS',
            vintage: 2021, tonnes: 10000, pricePerTonne: 15,
            permanencePeriod: 40, yearsElapsed: 3,
            registry: 'VERRA', countryRiskScore: 0.4,
            physicalClimateRisk: 0.3, verificationFrequency: 2, stage: 1,
          }],
        },
      }, 400);
    }

    const portfolio = portfolioECL(credits as CarbonCredit[]);

    const response: Record<string, unknown> = {
      summary: {
        totalEAD:          +portfolio.totalEAD.toFixed(2),
        totalProvision:    +portfolio.totalProvision.toFixed(2),
        coverageRatio:     +(portfolio.coverageRatio).toFixed(3),
        weightedAvgPFP:    +portfolio.weightedAvgPFP.toFixed(5),
        concentrationRisk: portfolio.concentrationRisk,
      },
      staging: {
        stage1: portfolio.stage1Count,
        stage2: portfolio.stage2Count,
        stage3: portfolio.stage3Count,
      },
      credits: portfolio.credits.map(r => ({
        id:          r.creditId,
        stage:       r.stage,
        riskScore:   r.riskScore,
        sicr:        r.sicr,
        pfp12m:      +r.pfp12m.toFixed(5),
        pfpLifetime: +r.pfpLifetime.toFixed(5),
        ead:         +r.ead.toFixed(2),
        provision:   +r.provisionRequired.toFixed(2),
        rationale:   r.stageRationale,
      })),
    };

    if (scenarios) {
      response.scenarioWeighted = (credits as CarbonCredit[]).map(credit => {
        const sw = scenarioWeightedECL(credit);
        return {
          id:       credit.id,
          base:     +sw.baseCase.toFixed(2),
          upside:   +sw.upside.toFixed(2),
          downside: +sw.downside.toFixed(2),
          weighted: +sw.weightedECL.toFixed(2),
        };
      });
    }

    return c.json(response);

  } catch (err) {
    return c.json({ error: 'ECL calculation failed', detail: String(err) }, 500);
  }
});

// ── 404 ───────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({
  error:     'Endpoint not found',
  available: [
    'POST /api/price',
    'POST /api/simulate',
    'POST /api/calibrate',
    'POST /api/permanence_ecl',
  ],
  docs: 'https://github.com/Rakshit309/quant-carbon',
}, 404));

export default app;