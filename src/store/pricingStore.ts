// ── Pricing Store ─────────────────────────────────────────────────────────
// Zustand store manages all pricing state across both dashboards.
// Two slices: equity (BS parameters) and carbon (OU parameters).
// Results are fetched from the live Cloudflare Workers API.

import { create } from 'zustand';

const API = 'https://quant-carbon.shoumyadeep309.workers.dev';
const KEY = 'demo';

// ── Types ─────────────────────────────────────────────────────────────────

export interface EquityParams {
  S: number; K: number; T: number; r: number; sigma: number; isCall: boolean;
}

export interface CarbonParams {
  S: number; K: number; T: number; r: number;
  sigma: number; kappa: number; theta: number; isCall: boolean;
}

export interface Greeks {
  delta: number; gamma: number; vega: number; theta: number; rho?: number;
  kappaSensitivity?: number; thetaSensitivity?: number;
}

export interface PriceResult {
  price: number;
  model: string;
  greeks: Greeks;
  crossCheck?: { monteCarlo?: number; finDifference?: number; maxDivergence?: number; ci95?: number[] };
  analytics?: { moneyness?: string; forwardPrice?: number; terminalStdDev?: number; intrinsicValue?: number; timeValue?: number; halfLifeDays?: number };
}

export interface SimulateResult {
  paths: number[][];
  terminalStats: { mean: number; stdDev: number; halfLifeDays?: number };
  scenarios?: { horizon: number; expectedPrice: number; stdDev: number; upper95: number; lower05: number }[];
}

interface PricingState {
  // ── Equity ────────────────────────────────────────────────────────────
  equityParams:  EquityParams;
  equityResult:  PriceResult | null;
  equityPaths:   number[][] | null;
  equityLoading: boolean;
  equityError:   string | null;

  // ── Carbon ────────────────────────────────────────────────────────────
  carbonParams:  CarbonParams;
  carbonResult:  PriceResult | null;
  carbonPaths:   number[][] | null;
  carbonLoading: boolean;
  carbonError:   string | null;

  // ── UI ────────────────────────────────────────────────────────────────
  activeTab: 'equity' | 'carbon' | 'var';

  // ── Actions ───────────────────────────────────────────────────────────
  setEquityParams: (p: Partial<EquityParams>) => void;
  setCarbonParams: (p: Partial<CarbonParams>) => void;
  setActiveTab:    (t: 'equity' | 'carbon' | 'var') => void;
  fetchEquity:     () => Promise<void>;
  fetchCarbon:     () => Promise<void>;
}

// ── API helpers ───────────────────────────────────────────────────────────

async function post(endpoint: string, body: object) {
  const res = await fetch(`${API}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Store ─────────────────────────────────────────────────────────────────

export const usePricingStore = create<PricingState>((set, get) => ({
  // Defaults
  equityParams: { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.20, isCall: true },
  equityResult: null, equityPaths: null, equityLoading: false, equityError: null,

  carbonParams: { S: 65, K: 65, T: 1, r: 0.04, sigma: 15, kappa: 1.0, theta: 60, isCall: true },
  carbonResult: null, carbonPaths: null, carbonLoading: false, carbonError: null,

  activeTab: 'equity',

  setEquityParams: (p) => {
    set(s => ({ equityParams: { ...s.equityParams, ...p } }));
    get().fetchEquity();
  },

  setCarbonParams: (p) => {
    set(s => ({ carbonParams: { ...s.carbonParams, ...p } }));
    get().fetchCarbon();
  },

  setActiveTab: (t) => set({ activeTab: t }),

  fetchEquity: async () => {
    const p = get().equityParams;
    set({ equityLoading: true, equityError: null });
    try {
      const [priceData, simData] = await Promise.all([
        post('/api/price', { ...p }),
        post('/api/simulate', { S: p.S, T: p.T, r: p.r, sigma: p.sigma, model: 'gbm', K: p.K }),
      ]);
      set({ equityResult: priceData, equityPaths: simData.paths, equityLoading: false });
    } catch (e) {
      set({ equityError: String(e), equityLoading: false });
    }
  },

  fetchCarbon: async () => {
    const p = get().carbonParams;
    set({ carbonLoading: true, carbonError: null });
    try {
      const [priceData, simData] = await Promise.all([
        post('/api/price', { ...p, model: 'bachelier' }),
        post('/api/simulate', { S: p.S, T: p.T, r: p.r, sigma: p.sigma, model: 'ou', kappa: p.kappa, theta: p.theta, K: p.K }),
      ]);
      set({ carbonResult: priceData, carbonPaths: simData.paths, carbonLoading: false });
    } catch (e) {
      set({ carbonError: String(e), carbonLoading: false });
    }
  },
}));