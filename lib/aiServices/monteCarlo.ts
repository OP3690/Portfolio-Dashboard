/**
 * monteCarlo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Geometric Brownian Motion (GBM) Monte Carlo simulation.
 *
 * Models: S(t+1) = S(t) · exp( (μ - σ²/2) + σ · Z )   where Z ~ N(0,1)
 *
 * Outputs: P( S(T) / S(0) ≥ 1 + targetReturn )  over T trading days
 *
 * Uses Box-Muller transform for fast Normal RNG (no external libs).
 *
 * Calibrated on the last `lookbackDays` log-returns from real OHLCV data.
 * Applies a GARCH(1,1)-style volatility correction when recent vol ≠ long-run vol.
 */

import { OHLCVBar } from './marketData';

/* ─── Normal RNG ──────────────────────────────────────────────────────────── */
// Box-Muller transform — produces two independent N(0,1) samples
function boxMullerPair(): [number, number] {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

/* ─── Core simulation ─────────────────────────────────────────────────────── */
export interface MonteCarloResult {
  probability:     number;   // P(return >= target) [0,1]
  expectedReturn:  number;   // mean simulated return (%)
  medianReturn:    number;   // median simulated return (%)
  worstCase5pct:   number;   // 5th percentile return (%)
  dailyVolatility: number;   // calibrated daily vol (annualised %)
  drift:           number;   // annualised drift used in simulation (%)
  simulations:     number;
}

export function monteCarloSimulation(
  bars:          OHLCVBar[],
  targetReturn   = 0.05,     // 5%
  horizonDays    = 3,
  simulations    = 12_000,
  lookbackDays   = 60,
): MonteCarloResult {
  if (bars.length < 10) {
    return { probability: 0.1, expectedReturn: 0, medianReturn: 0,
             worstCase5pct: -5, dailyVolatility: 0, drift: 0, simulations };
  }

  const closes   = bars.slice(-Math.min(lookbackDays + 1, bars.length)).map(b => b.close);
  const logRets  = closes.slice(1).map((c, i) => Math.log(c / closes[i]));

  if (logRets.length < 5) {
    return { probability: 0.1, expectedReturn: 0, medianReturn: 0,
             worstCase5pct: -5, dailyVolatility: 0, drift: 0, simulations };
  }

  // Estimate drift (μ) and daily volatility (σ) from historical data
  const mu     = logRets.reduce((s, r) => s + r, 0) / logRets.length;
  const varLR  = logRets.reduce((s, r) => s + (r - mu) ** 2, 0) / (logRets.length - 1);
  const sigma  = Math.sqrt(varLR);

  // GARCH-style correction: blend long-run vol with recent (5-day) vol
  const recent5  = logRets.slice(-5);
  const muR5     = recent5.reduce((s, r) => s + r, 0) / recent5.length;
  const sigmaR5  = Math.sqrt(recent5.reduce((s, r) => s + (r - muR5) ** 2, 0) / recent5.length);
  const sigmaEff = 0.7 * sigma + 0.3 * sigmaR5; // weighted blend

  // GBM drift adjustment: (μ - σ²/2) per day
  const drift = mu - 0.5 * sigmaEff * sigmaEff;

  // Run simulations
  const finalReturns: number[] = new Array(simulations);
  let hits = 0;

  for (let i = 0; i < simulations; i += 2) {
    // Simulate two paths at once (Box-Muller gives two normals)
    const [z1, z2] = boxMullerPair();

    let logR1 = 0, logR2 = 0;
    for (let d = 0; d < horizonDays; d++) {
      const [za, zb] = boxMullerPair();
      logR1 += drift + sigmaEff * za;
      logR2 += drift + sigmaEff * zb;
    }

    const ret1 = Math.exp(logR1) - 1;
    const ret2 = Math.exp(logR2) - 1;

    finalReturns[i]     = ret1;
    finalReturns[i + 1] = ret2;

    if (ret1 >= targetReturn) hits++;
    if (ret2 >= targetReturn) hits++;
  }

  finalReturns.sort((a, b) => a - b);

  const probability    = hits / simulations;
  const expectedReturn = finalReturns.reduce((s, r) => s + r, 0) / simulations * 100;
  const medianReturn   = finalReturns[Math.floor(simulations / 2)] * 100;
  const worstCase5pct  = finalReturns[Math.floor(simulations * 0.05)] * 100;

  return {
    probability,
    expectedReturn,
    medianReturn,
    worstCase5pct,
    dailyVolatility: sigmaEff * Math.sqrt(252) * 100,  // annualised %
    drift:           drift * 252 * 100,                 // annualised %
    simulations,
  };
}
