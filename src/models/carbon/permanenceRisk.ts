// ── Carbon Credit Permanence Risk — IFRS 9 ECL Framework ──────────────────
// This model applies the IFRS 9 Expected Credit Loss methodology directly
// to voluntary carbon credit portfolios. The mapping is exact:
//
//   IFRS 9 Credit Risk          →   Carbon Permanence Risk
//   ─────────────────────────────────────────────────────────
//   Probability of Default (PD) →   Permanence Failure Probability (PFP)
//   Loss Given Default (LGD)    →   Loss Factor on Failure (LFF)
//   Exposure at Default (EAD)   →   Credit Portfolio Exposure (CPE)
//   Expected Credit Loss (ECL)  →   Expected Carbon Loss (ECL)
//   Stage 1 (12-month ECL)      →   Low permanence risk credits
//   Stage 2 (Lifetime ECL)      →   Significant increase in risk (SICR)
//   Stage 3 (Credit-impaired)   →   Confirmed project reversal
//
// WHAT IS A PERMANENCE FAILURE?
// A carbon credit represents a tonne of CO2 either removed from the
// atmosphere or avoided. A permanence failure occurs when that removal
// is reversed — a reforestation project burns down, a methane capture
// facility shuts, a government reverses land-use policy. The credit
// has been sold and retired against a corporate net-zero commitment,
// but the physical abatement no longer exists.
//
// WHY THIS MATTERS FOR MATRIIQ:
// As IFRS accounting standards for carbon credits mature, companies
// holding voluntary credit portfolios will need balance sheet provisions
// against permanence risk. This model provides that provision calculation —
// the same framework used for loan loss provisioning, applied to carbon.
// This is the Matriiq Markets premium tier: compliance data + financial risk.

// ── Enumerations ──────────────────────────────────────────────────────────

export enum ProjectType {
  REDD_PLUS             = 'REDD_PLUS',           // Avoided deforestation
  IFM                   = 'IFM',                  // Improved forest management
  BLUE_CARBON           = 'BLUE_CARBON',           // Mangroves, seagrasses
  METHANE_CAPTURE       = 'METHANE_CAPTURE',       // Landfill, agricultural
  RENEWABLE_ENERGY      = 'RENEWABLE_ENERGY',      // Solar, wind offsets
  DIRECT_AIR_CAPTURE    = 'DIRECT_AIR_CAPTURE',    // Geological storage
  COOKSTOVES            = 'COOKSTOVES',             // Efficiency, behaviour
  SOIL_CARBON           = 'SOIL_CARBON',            // Agricultural sequestration
}

export enum Registry {
  VERRA                 = 'VERRA',                 // Verified Carbon Standard
  GOLD_STANDARD         = 'GOLD_STANDARD',         // Gold Standard Foundation
  ACR                   = 'ACR',                   // American Carbon Registry
  CAR                   = 'CAR',                   // Climate Action Reserve
  GLOBAL_CARBON_COUNCIL = 'GLOBAL_CARBON_COUNCIL', // GCC (MENA)
  UNVERIFIED            = 'UNVERIFIED',             // No third-party verification
}

export type ECLStage = 1 | 2 | 3;

// ── Interfaces ────────────────────────────────────────────────────────────

export interface CarbonCredit {
  id: string;
  projectType: ProjectType;
  vintage: number;             // Year of issuance (e.g. 2021)
  tonnes: number;              // EAD equivalent — number of credits held
  pricePerTonne: number;       // Current market price €/tonne
  permanencePeriod: number;    // Years of commitment (typically 40–100)
  yearsElapsed: number;        // Years since project start
  registry: Registry;
  countryRiskScore: number;    // 0–1: political instability (0=stable, 1=fragile)
  physicalClimateRisk: number; // 0–1: fire/drought/sea-level risk
  verificationFrequency: number; // Years between third-party verifications
  stage: ECLStage;             // Current IFRS 9 stage assignment
}

export interface ECLResult {
  creditId: string;
  pfp12m: number;              // 12-month permanence failure probability
  pfpLifetime: number;         // Lifetime PFP over remaining permanence period
  lff: number;                 // Loss Factor on Failure (LGD equivalent)
  ead: number;                 // Exposure: tonnes × pricePerTonne
  ecl12m: number;              // 12-month ECL (Stage 1)
  eclLifetime: number;         // Lifetime ECL (Stage 2/3)
  provisionRequired: number;   // Balance sheet provision based on stage
  stage: ECLStage;
  riskScore: number;           // Composite 0–100 for dashboard display
  sicr: boolean;               // Significant Increase in Credit Risk flag
  stageRationale: string;      // Human-readable explanation
}

export interface PortfolioECLResult {
  totalEAD: number;            // Total portfolio exposure (€)
  totalECL12m: number;         // Portfolio 12-month ECL
  totalECLLifetime: number;    // Portfolio lifetime ECL
  totalProvision: number;      // Total balance sheet provision required
  coverageRatio: number;       // Provision / EAD (%)
  stage1Count: number;
  stage2Count: number;
  stage3Count: number;
  credits: ECLResult[];
  weightedAvgPFP: number;      // Exposure-weighted average PFP
  concentrationRisk: string;   // Largest single credit as % of portfolio
}

export interface ScenarioWeightedECL {
  baseCase: number;            // ECL under base scenario
  upside: number;              // ECL under favourable scenario
  downside: number;            // ECL under stress scenario
  weightedECL: number;         // Probability-weighted ECL (IFRS 9 requirement)
  baseWeight: number;          // Scenario probability weights
  upsideWeight: number;
  downsideWeight: number;
}

// ── Base Risk Parameters by Project Type ─────────────────────────────────
// Annual permanence failure rates derived from academic literature and
// BeZero/Sylvera rating agency disclosures. These are starting point
// estimates — production systems would calibrate against realised
// reversal events in the project database.
//
// CONNECTION TO IFRS 9: These are the through-the-cycle PD estimates
// equivalent to the base PDs in your IFRS 9 model. The forward-looking
// adjustment (macro overlay) comes from countryRisk and physicalClimateRisk.

const BASE_ANNUAL_PFP: Record<ProjectType, number> = {
  [ProjectType.DIRECT_AIR_CAPTURE]:  0.003, // 0.3%  — geological, highly permanent
  [ProjectType.METHANE_CAPTURE]:     0.010, // 1.0%  — industrial, verifiable
  [ProjectType.RENEWABLE_ENERGY]:    0.008, // 0.8%  — additionality risk mainly
  [ProjectType.BLUE_CARBON]:         0.025, // 2.5%  — sea level, development pressure
  [ProjectType.IFM]:                 0.020, // 2.0%  — fire, harvesting, policy
  [ProjectType.SOIL_CARBON]:         0.030, // 3.0%  — tillage reversal, measurement
  [ProjectType.REDD_PLUS]:           0.035, // 3.5%  — deforestation, governance
  [ProjectType.COOKSTOVES]:          0.040, // 4.0%  — behaviour change, additionality
};

// Base Loss Factor on Failure (LGD equivalent)
// Not all permanence failures result in 100% loss.
// Methane: if facility shuts, emissions occur — full loss.
// Forests: partial replanting possible — partial loss.
const BASE_LFF: Record<ProjectType, number> = {
  [ProjectType.DIRECT_AIR_CAPTURE]:  0.05,  // Near-zero: geological storage persists
  [ProjectType.METHANE_CAPTURE]:     0.90,  // High: emissions release is permanent
  [ProjectType.RENEWABLE_ENERGY]:    0.70,  // High: additionality cannot be recovered
  [ProjectType.BLUE_CARBON]:         0.75,  // High: coastal ecosystems slow to recover
  [ProjectType.IFM]:                 0.60,  // Moderate: some replanting offsets loss
  [ProjectType.SOIL_CARBON]:         0.80,  // High: tillage reversal releases carbon
  [ProjectType.REDD_PLUS]:           0.65,  // Moderate: jurisdictional buffers apply
  [ProjectType.COOKSTOVES]:          0.95,  // Near-full: behaviour change unrecoverable
};

// Registry quality discount on PFP (well-governed registries catch
// problems earlier, reducing realised failure rates)
const REGISTRY_DISCOUNT: Record<Registry, number> = {
  [Registry.VERRA]:                 0.85,  // 15% reduction — strong MRV standards
  [Registry.GOLD_STANDARD]:         0.80,  // 20% reduction — strict co-benefits
  [Registry.ACR]:                   0.88,  // 12% reduction
  [Registry.CAR]:                   0.88,  // 12% reduction
  [Registry.GLOBAL_CARBON_COUNCIL]: 0.92,  // 8% reduction
  [Registry.UNVERIFIED]:            1.30,  // 30% INCREASE — no third-party oversight
};

// ── Core Risk Functions ───────────────────────────────────────────────────

// Computes adjusted annual PFP for a specific credit.
// Structure mirrors your IFRS 9 PD adjustment methodology:
// Base PD × forward-looking macro multiplier × idiosyncratic factors.
function adjustedAnnualPFP(credit: CarbonCredit): number {
  const base = BASE_ANNUAL_PFP[credit.projectType];

  // Forward-looking adjustments (IFRS 9 equivalent of macro overlay)
  const countryMultiplier  = 1 + 0.6 * credit.countryRiskScore;
  const climateMultiplier  = 1 + 0.4 * credit.physicalClimateRisk;

  // Registry quality discount
  const registryFactor     = REGISTRY_DISCOUNT[credit.registry];

  // Vintage seasoning: projects older than 5 years with no issues
  // show lower risk (survival bias — similar to seasoning curves in mortgages)
  const seasoningDiscount  = credit.yearsElapsed > 5 ? 0.85 : 1.0;

  // Verification frequency: more frequent = earlier problem detection
  const verificationFactor = credit.verificationFrequency <= 1 ? 0.90
                           : credit.verificationFrequency <= 3 ? 1.00
                           : 1.15; // infrequent verification increases risk

  return Math.min(
    base * countryMultiplier * climateMultiplier
         * registryFactor * seasoningDiscount * verificationFactor,
    0.99  // cap at 99% — avoids mathematical edge cases
  );
}

// Lifetime PFP over remaining permanence period.
// Uses survival analysis: P(failure before T) = 1 − (1 − annual_pfp)^T
// This is identical to the cumulative PD curve in IFRS 9 lifetime ECL.
function lifetimePFP(annualPFP: number, remainingYears: number): number {
  if (remainingYears <= 0) return 0;
  return 1 - Math.pow(1 - annualPFP, remainingYears);
}

// Composite risk score 0–100 for dashboard display
function computeRiskScore(annualPFP: number, lff: number, yearsRemaining: number): number {
  const pfpNorm   = Math.min(annualPFP / 0.05, 1);   // normalised to 5% max
  const lffNorm   = lff;
  const timeNorm  = Math.min(yearsRemaining / 50, 1); // longer = more risk
  return Math.round((pfpNorm * 0.5 + lffNorm * 0.3 + timeNorm * 0.2) * 100);
}

// SICR detection — mirrors your IFRS 9 Stage 2 trigger logic.
// Significant Increase in Credit Risk when:
// 1. Country risk score exceeds threshold, OR
// 2. Physical climate risk is high, OR
// 3. Unverified registry, OR
// 4. Annual PFP doubles from base rate
function detectSICR(credit: CarbonCredit, annualPFP: number): boolean {
  const basePFP = BASE_ANNUAL_PFP[credit.projectType];
  return (
    credit.countryRiskScore > 0.6 ||
    credit.physicalClimateRisk > 0.7 ||
    credit.registry === Registry.UNVERIFIED ||
    annualPFP > basePFP * 2.0
  );
}

// Stage assignment with rationale
function assignStage(
  credit: CarbonCredit,
  annualPFP: number,
  sicr: boolean
): { stage: ECLStage; rationale: string } {
  if (credit.stage === 3) {
    return { stage: 3, rationale: 'Confirmed project reversal — full write-off' };
  }
  if (sicr || credit.stage === 2) {
    return {
      stage: 2,
      rationale: sicr
        ? 'SICR triggered — lifetime ECL required'
        : 'Maintained Stage 2 — no improvement in risk profile',
    };
  }
  return { stage: 1, rationale: 'Low permanence risk — 12-month ECL sufficient' };
}

// ── Primary ECL Calculator ────────────────────────────────────────────────

export function creditECL(credit: CarbonCredit): ECLResult {
  const annualPFP      = adjustedAnnualPFP(credit);
  const pfp12m         = 1 - Math.pow(1 - annualPFP, 1); // 12-month PFP
  const remainingYears = credit.permanencePeriod - credit.yearsElapsed;
  const pfpLife        = lifetimePFP(annualPFP, remainingYears);
  const lff            = BASE_LFF[credit.projectType];
  const ead            = credit.tonnes * credit.pricePerTonne;
  const ecl12m         = pfp12m  * lff * ead;
  const eclLifetime    = pfpLife * lff * ead;
  const sicr           = detectSICR(credit, annualPFP);
  const { stage, rationale } = assignStage(credit, annualPFP, sicr);
  const riskScore      = computeRiskScore(annualPFP, lff, remainingYears);

  // Provision based on stage — same logic as IFRS 9:
  // Stage 1: 12-month ECL only
  // Stage 2: Lifetime ECL
  // Stage 3: Full EAD (write-off)
  const provisionRequired = stage === 1 ? ecl12m
                          : stage === 2 ? eclLifetime
                          : ead;

  return {
    creditId: credit.id,
    pfp12m,
    pfpLifetime: pfpLife,
    lff,
    ead,
    ecl12m,
    eclLifetime,
    provisionRequired,
    stage,
    riskScore,
    sicr,
    stageRationale: rationale,
  };
}

// ── Portfolio ECL Aggregation ─────────────────────────────────────────────
// Aggregates ECL across a portfolio of carbon credits.
// This is the balance sheet view — total provision required across
// all credits, broken down by stage and project type.

export function portfolioECL(credits: CarbonCredit[]): PortfolioECLResult {
  const results      = credits.map(creditECL);
  const totalEAD     = results.reduce((s, r) => s + r.ead, 0);
  const totalECL12m  = results.reduce((s, r) => s + r.ecl12m, 0);
  const totalECLLife = results.reduce((s, r) => s + r.eclLifetime, 0);
  const totalProv    = results.reduce((s, r) => s + r.provisionRequired, 0);

  const stage1 = results.filter(r => r.stage === 1);
  const stage2 = results.filter(r => r.stage === 2);
  const stage3 = results.filter(r => r.stage === 3);

  // Exposure-weighted average PFP
  const weightedPFP = totalEAD > 0
    ? results.reduce((s, r) => s + r.pfp12m * r.ead, 0) / totalEAD
    : 0;

  // Concentration risk: largest single credit as % of portfolio
  const maxEAD = Math.max(...results.map(r => r.ead));
  const concPct = totalEAD > 0 ? ((maxEAD / totalEAD) * 100).toFixed(1) : '0';
  const concCredit = results.find(r => r.ead === maxEAD);
  const concentrationRisk =
    `${concPct}% in credit ${concCredit?.creditId ?? 'unknown'}`;

  return {
    totalEAD,
    totalECL12m,
    totalECLLifetime: totalECLLife,
    totalProvision: totalProv,
    coverageRatio: totalEAD > 0 ? (totalProv / totalEAD) * 100 : 0,
    stage1Count: stage1.length,
    stage2Count: stage2.length,
    stage3Count: stage3.length,
    credits: results,
    weightedAvgPFP: weightedPFP,
    concentrationRisk,
  };
}

// ── Scenario-Weighted ECL ─────────────────────────────────────────────────
// IFRS 9 requires probability-weighted ECL across multiple scenarios.
// This mirrors your existing IFRS 9 three-scenario framework exactly.

export function scenarioWeightedECL(
  credit: CarbonCredit,
  weights = { base: 0.50, upside: 0.25, downside: 0.25 }
): ScenarioWeightedECL {
  // Base case — current parameters
  const base = creditECL(credit).provisionRequired;

  // Upside — improved governance, lower physical risk
  const upsideCredit: CarbonCredit = {
    ...credit,
    countryRiskScore:    Math.max(credit.countryRiskScore    - 0.2, 0),
    physicalClimateRisk: Math.max(credit.physicalClimateRisk - 0.2, 0),
  };
  const upside = creditECL(upsideCredit).provisionRequired;

  // Downside — policy reversal or physical climate stress
  const downsideCredit: CarbonCredit = {
    ...credit,
    countryRiskScore:    Math.min(credit.countryRiskScore    + 0.3, 1),
    physicalClimateRisk: Math.min(credit.physicalClimateRisk + 0.3, 1),
  };
  const downside = creditECL(downsideCredit).provisionRequired;

  const weightedECL =
    base     * weights.base    +
    upside   * weights.upside  +
    downside * weights.downside;

  return {
    baseCase:      base,
    upside,
    downside,
    weightedECL,
    baseWeight:     weights.base,
    upsideWeight:   weights.upside,
    downsideWeight: weights.downside,
  };
}