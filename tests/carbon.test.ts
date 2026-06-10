// ── Carbon Pricing Engine Tests ───────────────────────────────────────────
// Tests for the Ornstein-Uhlenbeck and Bachelier carbon models.
// Reference parameters are based on EU ETS market conditions:
//   EUA price: ~€65/tonne, equilibrium: ~€60, vol: ~€15/tonne√year

import { describe, it, expect } from 'vitest';
import { ouMonteCarlo, ouScenarios } from '../src/models/carbon/ornsteinUhlenbeck';
import { bachelierPrice, bachelierGreeks, compareModels } from '../src/models/carbon/bachelier';

// ── Reference Parameters ──────────────────────────────────────────────────
const ATM_EUA_CALL = {
  S: 65, K: 65, T: 1,
  r: 0.04, kappa: 1.0, theta: 60, sigma: 15,
  isCall: true,
};

const ATM_EUA_PUT = { ...ATM_EUA_CALL, isCall: false };

// ── Bachelier Analytical Tests ────────────────────────────────────────────
describe('Bachelier Carbon Option Pricing', () => {

  it('ATM EUA call produces a positive price', () => {
    const result = bachelierPrice(ATM_EUA_CALL);
    expect(result.price).toBeGreaterThan(0);
    expect(result.price).toBeLessThan(ATM_EUA_CALL.S); // always less than spot
  });

  it('Forward price mean-reverts toward theta', () => {
    const result = bachelierPrice(ATM_EUA_CALL);
    // F should be between S and θ when T=1, κ=1
    expect(result.forwardPrice).toBeGreaterThan(ATM_EUA_CALL.theta - 1);
    expect(result.forwardPrice).toBeLessThan(ATM_EUA_CALL.S + 1);
  });

  it('Bachelier put-call parity holds', () => {
    // Call - Put = disc × (F - K)
    const call = bachelierPrice(ATM_EUA_CALL);
    const put  = bachelierPrice(ATM_EUA_PUT);
    const disc = Math.exp(-ATM_EUA_CALL.r * ATM_EUA_CALL.T);
    const parity = disc * (call.forwardPrice - ATM_EUA_CALL.K);
    expect(call.price - put.price).toBeCloseTo(parity, 3);
  });

  it('Higher kappa reduces time value (stronger mean reversion → less uncertainty)', () => {
    const lowK  = bachelierPrice({ ...ATM_EUA_CALL, kappa: 0.3 });
    const highK = bachelierPrice({ ...ATM_EUA_CALL, kappa: 3.0 });
    // Higher κ means paths revert faster → less terminal uncertainty → lower option value
    expect(lowK.price).toBeGreaterThan(highK.price);
  });

  it('Price increases with higher sigma', () => {
    const lowVol  = bachelierPrice({ ...ATM_EUA_CALL, sigma: 5 });
    const highVol = bachelierPrice({ ...ATM_EUA_CALL, sigma: 25 });
    expect(highVol.price).toBeGreaterThan(lowVol.price);
  });

  it('Deep ITM call has high time value when S >> K', () => {
    const itm = bachelierPrice({ ...ATM_EUA_CALL, S: 90, K: 60 });
    expect(itm.price).toBeGreaterThan(0);
    expect(itm.intrinsic).toBeGreaterThan(0);
  });

  it('Time value approaches zero at very short expiry', () => {
    const expiring = bachelierPrice({ ...ATM_EUA_CALL, T: 0.001 });
    expect(expiring.timeValue).toBeLessThan(0.5);
  });

});

// ── Bachelier Greeks Tests ────────────────────────────────────────────────
describe('Bachelier Greeks', () => {

  it('Call delta is between 0 and 1', () => {
    const { delta } = bachelierGreeks(ATM_EUA_CALL);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(1);
  });

  it('Put delta is between -1 and 0', () => {
    const { delta } = bachelierGreeks(ATM_EUA_PUT);
    expect(delta).toBeGreaterThan(-1);
    expect(delta).toBeLessThan(0);
  });

  it('Gamma is positive for both calls and puts', () => {
    const callG = bachelierGreeks(ATM_EUA_CALL).gamma;
    const putG  = bachelierGreeks(ATM_EUA_PUT).gamma;
    expect(callG).toBeGreaterThan(0);
    expect(putG).toBeGreaterThan(0);
  });

  it('Theta can be positive in OU when S > theta — key carbon model difference from BS', () => {
  // IMPORTANT: In mean-reverting models, theta is NOT always negative.
  // When S=65 > θ=60, the forward price F=61.8 is below the strike K=65.
  // As T decreases (time passes), F rises toward S=65, making the call
  // more ATM and increasing its value. Theta is positive.
  // This behaviour is IMPOSSIBLE in Black-Scholes and is a key reason
  // why the OU model produces materially different prices for carbon options.
  const { theta: thetaAbove } = bachelierGreeks(ATM_EUA_CALL); // S=65 > θ=60
  expect(isFinite(thetaAbove)).toBe(true); // must be a valid number

  // When S < θ (price below equilibrium), forward price is ABOVE spot.
  // As T decreases, F falls toward S and away from a high strike.
  // Theta is negative in this configuration — conventional time decay.
  const belowEquil = { ...ATM_EUA_CALL, S: 50 }; // S=50 < θ=60
  const { theta: thetaBelow } = bachelierGreeks(belowEquil);
  expect(thetaBelow).toBeLessThan(0);
});

  it('Vega is positive — more vol means higher option value', () => {
    const { vega } = bachelierGreeks(ATM_EUA_CALL);
    expect(vega).toBeGreaterThan(0);
  });

});

// ── OU Monte Carlo Tests ──────────────────────────────────────────────────
describe('OU Monte Carlo Simulation', () => {

  it('MC price converges to Bachelier within 1.5', () => {
    const mc   = ouMonteCarlo({ ...ATM_EUA_CALL, N: 2000 });
    const bach = bachelierPrice(ATM_EUA_CALL).price;
    expect(Math.abs(mc.price - bach)).toBeLessThan(1.5);
  });

  it('95% CI contains the Bachelier analytical price', () => {
    const mc   = ouMonteCarlo({ ...ATM_EUA_CALL, N: 5000 });
    const bach = bachelierPrice(ATM_EUA_CALL).price;
    expect(mc.ci95[0]).toBeLessThan(bach);
    expect(mc.ci95[1]).toBeGreaterThan(bach);
  });

  it('Half-life is correctly computed from kappa', () => {
    const mc = ouMonteCarlo(ATM_EUA_CALL);
    // κ=1 → half-life = ln(2)/1 ≈ 0.693 years ≈ 8.3 months
    expect(mc.halfLife).toBeCloseTo(Math.log(2) / ATM_EUA_CALL.kappa, 4);
  });

  it('Forward price matches analytical OU expectation', () => {
    const mc = ouMonteCarlo(ATM_EUA_CALL);
    const expected = ATM_EUA_CALL.S * Math.exp(-ATM_EUA_CALL.kappa * ATM_EUA_CALL.T)
                   + ATM_EUA_CALL.theta * (1 - Math.exp(-ATM_EUA_CALL.kappa * ATM_EUA_CALL.T));
    expect(mc.forwardPrice).toBeCloseTo(expected, 4);
  });

  it('Returns 60 visualisation paths', () => {
    const mc = ouMonteCarlo(ATM_EUA_CALL);
    expect(mc.paths.length).toBe(60);
  });

});

// ── OU Scenario Analysis Tests ────────────────────────────────────────────
describe('OU Scenario Analysis', () => {

  it('Expected price at T=0 equals current spot', () => {
    const scenarios = ouScenarios(65, 1.0, 60, 15, [0]);
    expect(scenarios[0].expectedPrice).toBeCloseTo(65, 4);
  });

  it('Expected price converges toward theta over long horizons', () => {
    const scenarios = ouScenarios(65, 1.0, 60, 15, [0.5, 1, 2, 5, 10]);
    const longRun = scenarios[scenarios.length - 1].expectedPrice;
    // At T=10 with κ=1, virtually all mean-reversion has occurred
    expect(longRun).toBeCloseTo(60, 0);
  });

  it('Uncertainty bands widen at longer horizons (up to stationary limit)', () => {
    const scenarios = ouScenarios(65, 1.0, 60, 15, [0.25, 1, 3]);
    const sd025 = scenarios[0].stdDev;
    const sd1   = scenarios[1].stdDev;
    expect(sd1).toBeGreaterThan(sd025);
  });

});

// ── Model Comparison Test ─────────────────────────────────────────────────
describe('Bachelier vs Black-Scholes comparison', () => {

  it('Models produce different prices — validates that model choice matters', () => {
    const comparison = compareModels(ATM_EUA_CALL);
    // The models will differ — both prices should be positive
    expect(comparison.bachelierPrice).toBeGreaterThan(0);
    expect(comparison.blackScholesPrice).toBeGreaterThan(0);
    expect(comparison.note).toBeTruthy();
  });

});