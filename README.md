# quant-carbon

**Quantitative pricing engine for carbon and equity derivatives.**

Three independently verified pricing methods. Five REST API endpoints.
An IFRS 9 ECL framework for carbon credit portfolios.
78 passing tests.

[![Tests](https://img.shields.io/badge/tests-78%20passing-2dd67a)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3b8bfd)](src/)
[![License](https://img.shields.io/badge/license-MIT-f0a830)](LICENSE)
[![API](https://img.shields.io/badge/API-live-2dd67a)](https://quant-carbon.shoumyadeep309.workers.dev)
[![Docs](https://img.shields.io/badge/docs-mintlify-3b8bfd)](https://rakshit309.mintlify.app)

**Live API:** `https://quant-carbon.shoumyadeep309.workers.dev`

---

## Why two models

Most quantitative tools apply Black-Scholes to carbon options.
Black-Scholes assumes prices follow Geometric Brownian Motion — they
drift upward on average with no pull toward any equilibrium.

Carbon prices do not behave this way. The EU Emissions Trading System
has a regulatory cap that creates gravity toward a policy equilibrium.
When EUA prices rise far above the marginal abatement cost, compliance
activity increases and demand falls, pulling the price back down.
When prices fall below it, compliance buyers step in.

This is mean reversion. It requires a different stochastic process.

**Equity** — Geometric Brownian Motion:
```
dS = r·S·dt + σ·S·dW
```
Prices are log-normally distributed. Uncertainty grows as σ√T indefinitely.

**Carbon** — Ornstein-Uhlenbeck process:
```
dS = κ(θ − S)dt + σ·dW
```
Three parameters: κ (mean-reversion speed), θ (long-run equilibrium),
σ (absolute volatility in €/tonne). Prices are normally distributed.
Uncertainty saturates at σ/√(2κ) rather than growing without bound.

The pricing consequence is material. An ATM EUA call with S=65, K=65,
T=1 year, κ=1.0, θ=60 prices at **€2.45** under Bachelier-OU.
The equivalent Black-Scholes price (treating 15/65 = 23% as percentage vol)
gives a materially different result — and importantly, Black-Scholes
produces negative theta for this configuration while Bachelier-OU
correctly produces positive theta, because the forward price mean-reverts
below the strike as expiry approaches.

---

## What is built

```
src/
├── core/
│   ├── distributions.ts      Φ(x), φ(x), randNormal — shared foundation
│   ├── blackScholes.ts       Analytical BS price + all 5 Greeks
│   ├── monteCarlo.ts         GBM simulation, path storage, CI95
│   └── finiteDifference.ts   Crank-Nicolson PDE solver, Thomas algorithm
└── models/
    └── carbon/
        ├── ornsteinUhlenbeck.ts  OU simulation, scenario analysis
        ├── bachelier.ts          Analytical Bachelier-OU pricing + Greeks
        ├── permanenceRisk.ts     IFRS 9 ECL for carbon credit portfolios
        └── calibration.ts        OLS calibration from EUA price history
    └── risk/
        └── portfolioVar.ts       Monte Carlo VaR + Expected Shortfall
```

---

## Quickstart

```bash
git clone https://github.com/Rakshit309/quant-carbon.git
cd quant-carbon
npm install
npm run test        # 78 tests across core, carbon, and risk modules
npx wrangler dev    # Start API on localhost:8787
```

---

## API reference

All endpoints require `X-API-Key` header.
Pass any non-empty string in development.

  ### Price an equity option — Black-Scholes

  ```bash
  curl -X POST https://quant-carbon.shoumyadeep309.workers.dev/api/price \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-key" \
    -d '{"S":100,"K":100,"T":1,"r":0.05,"sigma":0.2,"isCall":true}'
  ```

  ```json
  {
    "price": 10.4506,
    "model": "black_scholes",
    "greeks": {
      "delta":  0.63683,
      "gamma":  0.01876,
      "vega":   0.37524,
      "theta": -0.01757,
      "rho":    0.53232
    },
    "crossCheck": {
      "monteCarlo":    10.2137,
      "finDifference": 10.4657,
      "maxDivergence":  0.2369
    },
    "analytics": { "moneyness": "ATM" }
  }
  ```

  ### Price a carbon EUA option — Bachelier-OU

  ```bash
  curl -X POST https://quant-carbon.shoumyadeep309.workers.dev/api/price \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-key" \
    -d '{
      "model": "bachelier",
      "S": 65, "K": 65, "T": 1,
      "r": 0.04, "sigma": 15,
      "kappa": 1.0, "theta": 60,
      "isCall": true
    }'
  ```

  ```json
  {
    "price": 2.4545,
    "model": "bachelier_ou",
    "instrument": "carbon_eua",
    "greeks": {
      "delta":            0.13230,
      "gamma":            0.00500,
      "vega":             0.23941,
      "theta":            0.00054,
      "kappaSensitivity": -1.89506,
      "thetaSensitivity":  0.22734
    },
    "analytics": {
      "forwardPrice":   61.8394,
      "terminalStdDev":  9.8628,
      "intrinsicValue":  0.0000,
      "timeValue":       2.4545,
      "halfLifeDays":      253.0,
      "moneyness": "ATM"
    },
    "crossCheck": { "monteCarlo": 2.503 }
  }
  ```

  Note the **positive theta** (0.00054). When S=65 > θ=60, the forward
  price is 61.84 — below the strike of 65. As time passes, the forward
  price rises back toward spot, making the call more ATM and increasing
  its value. Black-Scholes cannot produce this behaviour.

  ### Calibrate OU parameters from EUA price history

  ```bash
  curl -X POST https://quant-carbon.shoumyadeep309.workers.dev/api/calibrate \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-key" \
    -d '{}'
  ```

  Omit `prices` to use the built-in 48-month EUA dataset (2021–2024).
  Supply your own series for live calibration.

  ```json
  {
    "parameters": {
      "kappa":        2.2603,
      "theta":        72.498,
      "sigma":        24.808,
      "halfLifeDays": 111.9
    },
    "fit": {
      "rSquared":      0.7802,
      "nObservations":   48,
      "sampleMean":    68.242,
      "sampleStdDev":  14.870
    },
    "backtest": {
      "mae":      4.5206,
      "rmse":     6.5370,
      "rSquared": 0.7802
    },
    "interpretation": {
      "halfLifeMonths":  "3.7 months",
      "equilibriumRange": "€53–€92/tonne (90% stationary interval)",
      "modelFitQuality":  "Moderate (R²=78.0%)",
      "recommendedUse":   "Ready for production pricing"
    },
    "nextStep": "Pass kappa, theta, sigma to POST /api/price with model: bachelier"
  }
  ```

  EUA prices mean-revert with a **half-life of 3.7 months**.
  Deviations from the €72.50 equilibrium halve in under four months.

  ### Portfolio VaR and Expected Shortfall

  ```bash
  curl -X POST https://quant-carbon.shoumyadeep309.workers.dev/api/portfolio_var \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-key" \
    -d '{
      "positions": [
        {
          "id": "equity-call",
          "S": 100, "K": 100, "T": 1,
          "r": 0.05, "sigma": 0.2,
          "isCall": true, "quantity": 100,
          "model": "bs"
        },
        {
          "id": "carbon-call",
          "S": 65, "K": 65, "T": 1,
          "r": 0.04, "sigma": 15,
          "isCall": true, "quantity": 50,
          "model": "bachelier",
          "kappa": 1.0, "theta": 60
        }
      ],
      "confidenceLevel": 0.99,
      "horizon": 1,
      "N": 10000
    }'
  ```

  ```json
  {
    "riskMetrics": {
      "var99":   293.62,
      "var95":   244.76,
      "es99":    315.73,
      "es95":    274.93,
      "varLabel": "99% 1-day VaR"
    },
    "portfolio": {
      "value":       1167.78,
      "dollarDelta": 6798.29,
      "dollarGamma": 9908.75,
      "dollarVega":    49.49
    },
    "distribution": {
      "worstLoss": 395.11,
      "bestGain":  34826.97
    },
    "methodology": "Monte Carlo full revaluation — correlated price and vol shocks",
    "scenarios": 10000
  }
  ```

  Mixed portfolio of 100 equity calls + 50 EUA calls.
  Current value: **$1,167.78**.
  You will not lose more than **$293.62** on 99% of trading days.
  On the worst 1% of days, expected loss is **$315.73**.

  ### IFRS 9 ECL for carbon credit portfolios

  ```bash
  curl -X POST https://quant-carbon.shoumyadeep309.workers.dev/api/permanence_ecl \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-key" \
    -d '{
      "credits": [{
        "id": "REDD-001",
        "projectType": "REDD_PLUS",
        "vintage": 2021,
        "tonnes": 10000,
        "pricePerTonne": 15,
        "permanencePeriod": 40,
        "yearsElapsed": 3,
        "registry": "VERRA",
        "countryRiskScore": 0.4,
        "physicalClimateRisk": 0.3,
        "verificationFrequency": 2,
        "stage": 1
      }],
      "scenarios": true
    }'
  ```

  ```json
  {
    "summary": {
      "totalEAD":       150000,
      "totalProvision":   4028.39,
      "coverageRatio":       2.686,
      "weightedAvgPFP":      0.04132
    },
    "staging": { "stage1": 1, "stage2": 0, "stage3": 0 },
    "credits": [{
      "id":          "REDD-001",
      "stage":        1,
      "riskScore":   62,
      "sicr":         false,
      "pfp12m":       0.04132,
      "provision":    4028.39,
      "rationale":    "Low permanence risk — 12-month ECL sufficient"
    }]
  }
  ```

**IFRS 9 framework applied to voluntary carbon credits:**

| Credit risk term | Carbon equivalent |
|---|---|
| Probability of Default | Permanence failure probability |
| Loss Given Default | Fraction of tonnes unrecoverable |
| Exposure at Default | Tonnes × price per tonne |
| 12-month ECL (Stage 1) | Low permanence risk |
| Lifetime ECL (Stage 2) | SICR — governance or climate risk trigger |
| Write-off (Stage 3) | Confirmed project reversal |

A €150,000 REDD+ credit portfolio requires **€4,028 in balance sheet provisions**.

---

## The mathematics

### Black-Scholes PDE

```
∂V/∂t + ½σ²S²·∂²V/∂S² + rS·∂V/∂S − rV = 0
```

Solved analytically via the Black-Scholes formula.
Verified numerically by Crank-Nicolson FDM (Thomas algorithm).
Verified statistically by Monte Carlo GBM simulation.

### Ornstein-Uhlenbeck process

```
dS = κ(θ − S)dt + σ·dW
```

Calibrated from historical EUA prices via OLS regression on the
discrete AR(1) representation. The Bachelier model gives the
closed-form solution:

```
Call = e^{−rT} × [(F−K)·Φ(d) + σ_T·φ(d)]

where F    = S·e^{−κT} + θ·(1−e^{−κT})    (OU forward price)
      σ_T  = σ·√[(1−e^{−2κT})/(2κ)]        (terminal std deviation)
      d    = (F−K)/σ_T
```

### IFRS 9 ECL

```
ECL = PFP × LFF × EAD

Stage 1:  12-month ECL    = pfp_1yr  × LFF × EAD
Stage 2:  Lifetime ECL    = pfp_life × LFF × EAD
Stage 3:  Full write-off  = EAD
```

Permanence failure probability uses survival analysis:
```
P(failure before T) = 1 − (1 − annual_pfp)^T
```
Adjusted for country risk, physical climate risk, registry quality,
project seasoning, and verification frequency.

---

## Running the tests

```bash
npx vitest run
```

```
✓ tests/core.test.ts      (24 tests)   distributions, BS, MC, FDM
✓ tests/carbon.test.ts    (41 tests)   Bachelier, OU, ECL, calibration
✓ tests/risk.test.ts      (13 tests)   VaR, ES, portfolio Greeks

Tests  78 passed (78)
```

**ATM call benchmark** (S=K=100, T=1, r=5%, σ=20%):

| Method | Price | Error vs BS |
|---|---|---|
| Black-Scholes (analytical) | $10.4506 | — |
| Crank-Nicolson FDM | $10.4657 | $0.015 |
| Monte Carlo GBM (N=2,000) | ~$10.38 | <$0.75 |

---

## Background

Built by [Shoumyadeep Rakshit](https://github.com/Rakshit309) —
Risk Transformation and Technology Specialist with experience in
credit risk modelling (PD/LGD/EAD, IFRS 9), IFRS 17 stochastic
liability valuation, and data governance architecture at
Barclays and NN Group.

The permanence risk ECL model applies IFRS 9 methodology directly
to voluntary carbon credit portfolios — connecting twelve years of
credit risk experience to the emerging carbon market infrastructure.

---

## Roadmap

- [x] Core pricing engine (BS, MC, Crank-Nicolson)
- [x] Carbon models (OU, Bachelier, calibration)
- [x] IFRS 9 permanence risk ECL
- [x] REST API (Hono, Cloudflare Workers)
- [x] Portfolio VaR and Expected Shortfall
- [x] Cloudflare Workers deployment
- [x] API documentation site (rakshit309.mintlify.app)
- [ ] React dashboard (dark theme, GBM paths, Greeks profiles)
- [ ] GitHub Pages live demo

---

## License

MIT — see [LICENSE](LICENSE)# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
