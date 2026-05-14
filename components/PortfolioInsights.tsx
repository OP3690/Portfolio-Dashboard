'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Holding {
  stockName: string;
  isin?: string;
  marketValue: number;
  investmentAmount: number;
  profitLossTillDate: number;
  profitLossTillDatePercent: number;
  xirr?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  sectorName?: string;
}

interface PortfolioInsightsProps {
  holdings: Holding[];
}

/* ── Helpers ─────────────────────────────────────────────── */
function KpiChip({
  label, value, sub, color = 'var(--text-hi)', bg = 'var(--bg-raised)', border = 'var(--border-md)',
}: { label: string; value: string; sub?: string; color?: string; bg?: string; border?: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 4, fontWeight: 500 }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: 'var(--brand-bg)',
        border: '1px solid var(--brand-glow)', color: 'var(--brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 1 — WIN / LOSS DNA
   ═══════════════════════════════════════════════════════════ */
function WinLossDNA({ holdings }: { holdings: Holding[] }) {
  const stats = useMemo(() => {
    const returns = holdings.map(h => h.profitLossTillDatePercent || 0);
    const wins    = returns.filter(r => r > 0);
    const losses  = returns.filter(r => r < 0);

    const battingAvg  = returns.length > 0 ? (wins.length / returns.length) * 100 : 0;
    const avgWin      = wins.length   > 0 ? wins.reduce((s, r) => s + r, 0)   / wins.length   : 0;
    const avgLoss     = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;

    // Expected Value = (batting% × avgWin) − ((1−batting%) × avgLoss)
    const p = battingAvg / 100;
    const expectedValue = p * avgWin - (1 - p) * avgLoss;

    // Kelly Criterion: f* = (bp − q) / b  where b=payoff, p=win%, q=loss%
    const kellyPct = payoffRatio > 0 ? Math.max(0, ((payoffRatio * p - (1 - p)) / payoffRatio) * 100) : 0;

    // Largest single win & loss by ₹ amount
    const byPL   = [...holdings].sort((a, b) => (b.profitLossTillDate || 0) - (a.profitLossTillDate || 0));
    const bigWin = byPL[0];
    const bigLoss = byPL[byPL.length - 1];

    return { battingAvg, avgWin, avgLoss, payoffRatio, expectedValue, kellyPct, bigWin, bigLoss, wins, losses, returns };
  }, [holdings]);

  const {
    battingAvg, avgWin, avgLoss, payoffRatio, expectedValue, kellyPct,
    bigWin, bigLoss, wins, losses, returns,
  } = stats;

  const evPositive = expectedValue >= 0;

  return (
    <div className="card p-5">
      <SectionHeader
        title="Win / Loss DNA"
        subtitle="Batting average, payoff quality and expected value per position"
        icon={
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiChip
          label="Batting Average"
          value={`${battingAvg.toFixed(0)}%`}
          sub={`${wins.length} wins · ${losses.length} losses`}
          color={battingAvg >= 60 ? 'var(--gain)' : battingAvg >= 45 ? 'var(--warn)' : 'var(--loss)'}
          bg={battingAvg >= 60 ? 'var(--gain-bg)' : battingAvg >= 45 ? 'var(--warn-bg)' : 'var(--loss-bg)'}
          border={battingAvg >= 60 ? 'var(--gain-border)' : 'var(--loss-border)'}
        />
        <KpiChip
          label="Avg Win"
          value={`+${avgWin.toFixed(1)}%`}
          sub="Mean return of winners"
          color="var(--gain)"
          bg="var(--gain-bg)"
          border="var(--gain-border)"
        />
        <KpiChip
          label="Avg Loss"
          value={`−${avgLoss.toFixed(1)}%`}
          sub="Mean return of losers"
          color="var(--loss)"
          bg="var(--loss-bg)"
          border="var(--loss-border)"
        />
        <KpiChip
          label="Payoff Ratio"
          value={payoffRatio > 50 ? '>50×' : `${payoffRatio.toFixed(2)}×`}
          sub="Avg win ÷ avg loss"
          color={payoffRatio >= 1.5 ? 'var(--gain)' : payoffRatio >= 1 ? 'var(--warn)' : 'var(--loss)'}
        />
        <KpiChip
          label="Expected Value"
          value={`${evPositive ? '+' : ''}${expectedValue.toFixed(1)}%`}
          sub="Per position, long-run"
          color={evPositive ? 'var(--gain)' : 'var(--loss)'}
          bg={evPositive ? 'var(--gain-bg)' : 'var(--loss-bg)'}
          border={evPositive ? 'var(--gain-border)' : 'var(--loss-border)'}
        />
      </div>

      {/* Win / Loss split bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gain)' }}>
            {wins.length} Winners ({battingAvg.toFixed(0)}%)
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--loss)' }}>
            {losses.length} Losers ({(100 - battingAvg).toFixed(0)}%)
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 99, overflow: 'hidden', background: 'var(--loss-bg)', border: '1px solid var(--loss-border)' }}>
          <div style={{
            height: '100%',
            width: `${battingAvg}%`,
            background: 'linear-gradient(90deg, var(--gain), var(--gain-mid))',
            borderRadius: 99,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Insight row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {/* Kelly Criterion */}
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
            Kelly Criterion
          </p>
          <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>
            {kellyPct > 100 ? '>100' : kellyPct.toFixed(0)}%
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2 }}>Suggested max position size</p>
        </div>

        {/* Biggest winner */}
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--gain-bg)', border: '1px solid var(--gain-border)' }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
            Best Position ₹
          </p>
          <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bigWin ? `+${formatCurrency(bigWin.profitLossTillDate)}` : '—'}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bigWin?.stockName || '—'}
          </p>
        </div>

        {/* Biggest loser */}
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--loss-bg)', border: '1px solid var(--loss-border)' }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
            Worst Position ₹
          </p>
          <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--loss)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bigLoss && bigLoss.profitLossTillDate < 0 ? `−${formatCurrency(Math.abs(bigLoss.profitLossTillDate))}` : '—'}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bigLoss?.stockName || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2 — TAX PLANNING (India LTCG / STCG)
   ═══════════════════════════════════════════════════════════ */
const LTCG_EXEMPTION   = 125000;  // ₹1.25L exempt (FY2024-25)
const LTCG_TAX_RATE    = 0.125;   // 12.5%
const STCG_TAX_RATE    = 0.20;    // 20%
const LTCG_MONTHS      = 12;      // ≥ 12 months = long-term

function TaxPlanning({ holdings }: { holdings: Holding[] }) {
  const { ltcg, stcg, approaching, totalLTCGain, totalSTCGain, estLTCGTax, estSTCGTax } = useMemo(() => {
    const ltcg: Holding[]       = [];
    const stcg: Holding[]       = [];
    const approaching: Holding[] = [];

    holdings.forEach(h => {
      const months = (h.holdingPeriodYears || 0) * 12 + (h.holdingPeriodMonths || 0);
      // For integer years, holdingPeriodMonths may not be set
      const totalMonths = h.holdingPeriodYears !== undefined
        ? Math.round((h.holdingPeriodYears || 0) * 12)
        : (h.holdingPeriodMonths || 0);

      if (totalMonths >= LTCG_MONTHS) {
        ltcg.push(h);
      } else {
        stcg.push(h);
        if (totalMonths >= 9) approaching.push(h); // within 3 months of LTCG
      }
    });

    const totalLTCGain  = ltcg.reduce((s, h) => s + Math.max(0, h.profitLossTillDate || 0), 0);
    const totalSTCGain  = stcg.reduce((s, h) => s + Math.max(0, h.profitLossTillDate || 0), 0);
    const netLTCG       = Math.max(0, totalLTCGain - LTCG_EXEMPTION);
    const estLTCGTax    = netLTCG * LTCG_TAX_RATE;
    const estSTCGTax    = totalSTCGain * STCG_TAX_RATE;

    ltcg.sort((a, b) => (b.profitLossTillDate || 0) - (a.profitLossTillDate || 0));
    stcg.sort((a, b) => (b.profitLossTillDate || 0) - (a.profitLossTillDate || 0));

    return { ltcg, stcg, approaching, totalLTCGain, totalSTCGain, estLTCGTax, estSTCGTax };
  }, [holdings]);

  const totalEstTax = estLTCGTax + estSTCGTax;

  return (
    <div className="card p-5">
      <SectionHeader
        title="Tax Planning — LTCG vs STCG"
        subtitle="Estimated tax liability if all unrealised gains were booked today (India FY2024-25 rates)"
        icon={
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
        }
      />

      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiChip label="LTCG Holdings" value={`${ltcg.length}`} sub={`≥ 12 months · 12.5% tax`} color="var(--gain)" />
        <KpiChip label="STCG Holdings" value={`${stcg.length}`} sub={`< 12 months · 20% tax`} color="var(--warn)" bg="var(--warn-bg)" border="color-mix(in srgb,var(--warn) 25%,transparent)" />
        <KpiChip label="Unrealised LTCG" value={formatCurrency(totalLTCGain)} sub={`₹1.25L exempt → est. tax ${formatCurrency(estLTCGTax)}`} color="var(--gain)" bg="var(--gain-bg)" border="var(--gain-border)" />
        <KpiChip label="Unrealised STCG" value={formatCurrency(totalSTCGain)} sub={`Est. tax @ 20% = ${formatCurrency(estSTCGTax)}`} color="var(--warn)" bg="var(--warn-bg)" border="color-mix(in srgb,var(--warn) 25%,transparent)" />
        <KpiChip
          label="Total Est. Tax"
          value={formatCurrency(totalEstTax)}
          sub="If all gains booked today"
          color={totalEstTax > 50000 ? 'var(--loss)' : 'var(--text-hi)'}
          bg={totalEstTax > 50000 ? 'var(--loss-bg)' : 'var(--bg-raised)'}
          border={totalEstTax > 50000 ? 'var(--loss-border)' : 'var(--border-md)'}
        />
      </div>

      {/* "Approaching LTCG" alert */}
      {approaching.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'color-mix(in srgb,var(--warn) 8%,transparent)',
          border: '1px solid color-mix(in srgb,var(--warn) 28%,transparent)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <svg width="18" height="18" fill="none" stroke="var(--warn)" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', marginBottom: 3 }}>
              {approaching.length} stock{approaching.length > 1 ? 's' : ''} approaching LTCG threshold (9–12 months)
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-lo)' }}>
              Consider holding these until they cross 12 months to save {(STCG_TAX_RATE - LTCG_TAX_RATE) * 100}% in tax:&nbsp;
              <strong style={{ color: 'var(--text-hi)' }}>{approaching.map(h => h.stockName.split(' ')[0]).join(', ')}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Two column breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* LTCG column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gain)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-hi)' }}>Long-Term (≥ 12 months)</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{ltcg.length} stocks</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
            {ltcg.slice(0, 12).map((h, i) => {
              const pl = h.profitLossTillDate || 0;
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', borderRadius: 7, background: 'var(--bg-raised)',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                    {h.stockName}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {((h.holdingPeriodYears || 0) * 12).toFixed(0)}m
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: pl >= 0 ? 'var(--gain)' : 'var(--loss)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {pl >= 0 ? '+' : '−'}{formatCurrency(Math.abs(pl))}
                    </span>
                  </div>
                </div>
              );
            })}
            {ltcg.length > 12 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>+{ltcg.length - 12} more</p>
            )}
          </div>
        </div>

        {/* STCG column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--warn)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-hi)' }}>Short-Term (&lt; 12 months)</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{stcg.length} stocks</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
            {stcg.slice(0, 12).map((h, i) => {
              const pl = h.profitLossTillDate || 0;
              const totalMonths = Math.round((h.holdingPeriodYears || 0) * 12);
              const isApproaching = totalMonths >= 9;
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', borderRadius: 7,
                  background: isApproaching ? 'color-mix(in srgb,var(--warn) 8%,transparent)' : 'var(--bg-raised)',
                  border: isApproaching ? '1px solid color-mix(in srgb,var(--warn) 22%,transparent)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                    {h.stockName}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: isApproaching ? 'var(--warn)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: isApproaching ? 700 : 400 }}>
                      {totalMonths}m
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: pl >= 0 ? 'var(--gain)' : 'var(--loss)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {pl >= 0 ? '+' : '−'}{formatCurrency(Math.abs(pl))}
                    </span>
                  </div>
                </div>
              );
            })}
            {stcg.length > 12 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>+{stcg.length - 12} more</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3 — ALPHA GENERATORS vs PORTFOLIO DRAG
   ═══════════════════════════════════════════════════════════ */
function AlphaVsDrag({ holdings }: { holdings: Holding[] }) {
  const { portfolioAvgReturn, alpha, drag, neutrals } = useMemo(() => {
    const totalInvested = holdings.reduce((s, h) => s + (h.investmentAmount || 0), 0);
    const portfolioAvgReturn = totalInvested > 0
      ? holdings.reduce((s, h) => s + (h.profitLossTillDatePercent || 0) * ((h.investmentAmount || 0) / totalInvested), 0)
      : 0;

    const withAlpha = holdings.map(h => ({
      ...h,
      alpha: (h.profitLossTillDatePercent || 0) - portfolioAvgReturn,
      // Return velocity = annualised return (XIRR if available, else simple return / years)
      velocity: h.xirr ?? ((h.profitLossTillDatePercent || 0) / Math.max(h.holdingPeriodYears || 1, 0.1)),
    }));

    const sorted   = [...withAlpha].sort((a, b) => b.alpha - a.alpha);
    const alpha    = sorted.slice(0, 5);
    const drag     = [...withAlpha].sort((a, b) => a.alpha - b.alpha).slice(0, 5);
    const neutrals = withAlpha.filter(h => Math.abs(h.alpha) < 5);

    return { portfolioAvgReturn, alpha, drag, neutrals };
  }, [holdings]);

  const maxAlpha = Math.max(...alpha.map(h => Math.abs((h as any).alpha)), 1);
  const maxDrag  = Math.max(...drag.map(h => Math.abs((h as any).alpha)), 1);

  const AlphaRow = ({ h, isAlpha }: { h: any; isAlpha: boolean }) => {
    const absAlpha = Math.abs(h.alpha);
    const barW     = (absAlpha / (isAlpha ? maxAlpha : maxDrag)) * 100;
    const color    = isAlpha ? 'var(--gain)' : 'var(--loss)';
    const bgColor  = isAlpha ? 'var(--gain-bg)' : 'var(--loss-bg)';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.stockName}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
              Return: <span style={{ fontWeight: 700, color: (h.profitLossTillDatePercent || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                {(h.profitLossTillDatePercent || 0) >= 0 ? '+' : ''}{(h.profitLossTillDatePercent || 0).toFixed(1)}%
              </span>
              <span style={{ marginLeft: 8 }}>XIRR: <span style={{ fontWeight: 700, color: color }}>{h.velocity > 0 ? '+' : ''}{h.velocity.toFixed(1)}%</span></span>
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums',
              padding: '2px 8px', borderRadius: 99, background: bgColor,
            }}>
              {isAlpha ? '+' : ''}{h.alpha.toFixed(1)}%
            </span>
            <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>vs portfolio avg</p>
          </div>
        </div>
        {/* Alpha bar */}
        <div style={{ height: 4, borderRadius: 99, background: 'var(--border-md)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${barW}%`,
            background: isAlpha
              ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))'
              : 'linear-gradient(90deg,var(--loss),var(--loss-mid))',
          }} />
        </div>
      </div>
    );
  };

  return (
    <div className="card p-5">
      <SectionHeader
        title="Alpha Generators vs Portfolio Drag"
        subtitle={`Portfolio weighted avg return: ${portfolioAvgReturn >= 0 ? '+' : ''}${portfolioAvgReturn.toFixed(1)}% — stocks above this are alpha generators`}
        icon={
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        }
      />

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 12, background: 'var(--gain-bg)', border: '1px solid var(--gain-border)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>Alpha Generators</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--gain)' }}>
            {holdings.filter(h => (h.profitLossTillDatePercent || 0) > portfolioAvgReturn).length}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2 }}>stocks beating portfolio avg</p>
        </div>
        <div style={{ flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 12, background: 'var(--loss-bg)', border: '1px solid var(--loss-border)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>Drag Holdings</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--loss)' }}>
            {holdings.filter(h => (h.profitLossTillDatePercent || 0) < portfolioAvgReturn).length}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2 }}>stocks below portfolio avg</p>
        </div>
        <div style={{ flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 12, background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>Portfolio Avg Return</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>
            {portfolioAvgReturn >= 0 ? '+' : ''}{portfolioAvgReturn.toFixed(1)}%
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginTop: 2 }}>weighted by investment</p>
        </div>
      </div>

      {/* Two column leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Alpha column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--gain)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>Top Alpha Generators</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alpha.map((h, i) => <AlphaRow key={i} h={h} isAlpha={true} />)}
          </div>
        </div>

        {/* Drag column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--loss)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>Biggest Portfolio Drag</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drag.map((h, i) => <AlphaRow key={i} h={h} isAlpha={false} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════ */
export default function PortfolioInsights({ holdings }: PortfolioInsightsProps) {
  if (!holdings || holdings.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <WinLossDNA holdings={holdings} />
      <TaxPlanning holdings={holdings} />
      <AlphaVsDrag holdings={holdings} />
    </div>
  );
}
