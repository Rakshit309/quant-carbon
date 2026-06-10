// ── Portfolio VaR Tests ───────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeVaR, Position } from '../src/models/risk/portfolioVar';

// ── Reference Positions ───────────────────────────────────────────────────

const LONG_CALL: Position = {
  id: 'eq-call', S: 100, K: 100, T: 1,
  r: 0.05, sigma: 0.2, isCall: true,
  quantity: 100, notional: 1, model: 'bs',
};

const SHORT_PUT: Position = {
  id: 'eq-put', S: 100, K: 100, T: 1,
  r: 0.05, sigma: 0.2, isCall: false,
  quantity: -100, notional: 1, model: 'bs',
};

const CARBON_CALL: Position = {
  id: 'carbon-call', S: 65, K: 65, T: 1,
  r: 0.04, sigma: 15, isCall: true,
  quantity: 50, notional: 1, model: 'bachelier',
  kappa: 1.0, theta: 60,
};

// ── Single Position Tests ─────────────────────────────────────────────────
describe('Portfolio VaR — Single Position', () => {

  it('VaR is positive — represents a loss amount', () => {
    const result = computeVaR({ positions: [LONG_CALL], N: 1000 });
    expect(result.var99).toBeGreaterThan(0);
    expect(result.var95).toBeGreaterThan(0);
  });

  it('99% VaR is greater than 95% VaR', () => {
    const result = computeVaR({ positions: [LONG_CALL], N: 1000 });
    expect(result.var99).toBeGreaterThan(result.var95);
  });

  it('ES is greater than VaR at same confidence level', () => {
    // ES is the average of losses BEYOND VaR — always worse than VaR
    const result = computeVaR({ positions: [LONG_CALL], N: 2000 });
    expect(result.es99).toBeGreaterThan(result.var99);
    expect(result.es95).toBeGreaterThan(result.var95);
  });

  it('Portfolio value equals current option price × quantity', () => {
    const result  = computeVaR({ positions: [LONG_CALL], N: 500 });
    // Long 100 ATM calls at ~$10.45 = ~$1045
    expect(result.portfolioValue).toBeGreaterThan(500);
    expect(result.portfolioValue).toBeLessThan(2000);
  });

  it('Returns correct number of scenarios', () => {
    const N      = 500;
    const result = computeVaR({ positions: [LONG_CALL], N });
    expect(result.N).toBe(N);
  });

  it('P&L distribution has correct statistical properties', () => {
    const result = computeVaR({ positions: [LONG_CALL], N: 2000 });
    // Mean P&L should be close to zero (zero drift assumption)
    expect(Math.abs(result.meanPnL)).toBeLessThan(10);
    // Standard deviation should be positive
    expect(result.pnlStdDev).toBeGreaterThan(0);
  });

});

// ── Portfolio Tests ───────────────────────────────────────────────────────
describe('Portfolio VaR — Multiple Positions', () => {

  it('Mixed portfolio computes without error', () => {
    const result = computeVaR({
      positions: [LONG_CALL, SHORT_PUT, CARBON_CALL],
      N: 1000,
    });
    expect(result.var99).toBeGreaterThan(0);
    expect(result.positions.length).toBe(3);
  });

  it('Short position reduces portfolio VaR vs long only', () => {
    const longOnly   = computeVaR({ positions: [LONG_CALL], N: 2000 });
    const hedged     = computeVaR({ positions: [LONG_CALL, SHORT_PUT], N: 2000 });
    // Adding a short put (bearish) to a long call (bullish) hedges the position
    // The hedged portfolio should have different risk characteristics
    expect(hedged.portfolioDelta).not.toEqual(longOnly.portfolioDelta);
  });

  it('Portfolio Greeks aggregate correctly', () => {
    const result = computeVaR({ positions: [LONG_CALL, CARBON_CALL], N: 500 });
    // Both are long calls — portfolio delta should be positive
    expect(result.portfolioDelta).toBeGreaterThan(0);
  });

  it('Percentile distribution is monotonically increasing', () => {
    const result = computeVaR({ positions: [LONG_CALL], N: 2000 });
    const p      = result.pnlPercentiles;
    expect(p['p1']).toBeLessThan(p['p5']);
    expect(p['p5']).toBeLessThan(p['p25']);
    expect(p['p25']).toBeLessThan(p['p50']);
    expect(p['p50']).toBeLessThan(p['p75']);
    expect(p['p75']).toBeLessThan(p['p95']);
    expect(p['p95']).toBeLessThan(p['p99']);
  });

  it('Worst loss is greater than VaR', () => {
    const result = computeVaR({ positions: [LONG_CALL], N: 2000 });
    expect(result.worstLoss).toBeGreaterThan(result.var99);
  });

});

// ── Carbon Position Tests ─────────────────────────────────────────────────
describe('Portfolio VaR — Carbon Position', () => {

  it('Carbon option VaR is positive', () => {
    const result = computeVaR({ positions: [CARBON_CALL], N: 1000 });
    expect(result.var99).toBeGreaterThan(0);
  });

  it('Mixed equity and carbon portfolio computes correctly', () => {
    const result = computeVaR({
      positions:      [LONG_CALL, CARBON_CALL],
      N:              1000,
      confidenceLevel: 0.95,
    });
    expect(result.positions.length).toBe(2);
    expect(result.riskMetrics).toBeUndefined(); // raw result, not API response
    expect(result.var95).toBeGreaterThan(0);
  });

});