import { NextResponse } from 'next/server';

export const dynamic   = 'force-dynamic';
export const revalidate = 86400; // 24-hour cache

const BASE   = 'https://api.worldbank.org/v2';
const FORMAT = 'format=json&per_page=200';

const COUNTRIES = ['WLD', 'IN', 'US', 'CN', 'JP', 'DE', 'GB', 'FR', 'BR', 'KR', 'ZA'];
const C_PARAM   = COUNTRIES.join(';');

const INDICATORS = {
  gdp:        'NY.GDP.MKTP.CD',       // GDP current US$
  gdpGrowth:  'NY.GDP.MKTP.KD.ZG',   // GDP growth annual %
  inflation:  'FP.CPI.TOTL.ZG',      // CPI inflation annual %
  unemployment:'SL.UEM.TOTL.ZS',     // Unemployment % labour force
  gdpPerCap:  'NY.GDP.PCAP.CD',      // GDP per capita current US$
  fdi:        'BX.KLT.DINV.WD.GD.ZS',// FDI net inflows % GDP
  exports:    'NE.EXP.GNFS.ZS',      // Exports % GDP
  govDebt:    'GC.DOD.TOTL.GD.ZS',   // Central gov debt % GDP
};

async function fetchIndicator(code: string, mrv = 6): Promise<any[]> {
  try {
    const url = `${BASE}/country/${C_PARAM}/indicator/${code}?${FORMAT}&mrv=${mrv}`;
    const res  = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) && json[1] ? json[1] : [];
  } catch {
    return [];
  }
}

function buildTimeSeries(rows: any[]): Record<string, Record<string, number | null>> {
  // { countryCode: { year: value } }
  const map: Record<string, Record<string, number | null>> = {};
  for (const r of rows) {
    const code  = r.countryiso3code || r.country?.id;
    const year  = r.date;
    const value = r.value;
    if (!code || !year) continue;
    if (!map[code]) map[code] = {};
    map[code][year] = value;
  }
  return map;
}

function latestValue(series: Record<string, number | null>): { value: number | null; year: string | null } {
  const years = Object.keys(series).sort((a, b) => Number(b) - Number(a));
  for (const y of years) {
    if (series[y] != null) return { value: series[y], year: y };
  }
  return { value: null, year: null };
}

export async function GET() {
  try {
    const [gdpRows, growthRows, inflRows, unemplRows, gdpCapRows, fdiRows, expRows, debtRows] =
      await Promise.all([
        fetchIndicator(INDICATORS.gdp,          6),
        fetchIndicator(INDICATORS.gdpGrowth,    6),
        fetchIndicator(INDICATORS.inflation,    6),
        fetchIndicator(INDICATORS.unemployment, 4),
        fetchIndicator(INDICATORS.gdpPerCap,    2),
        fetchIndicator(INDICATORS.fdi,          4),
        fetchIndicator(INDICATORS.exports,      4),
        fetchIndicator(INDICATORS.govDebt,      4),
      ]);

    const gdpSeries    = buildTimeSeries(gdpRows);
    const growthSeries = buildTimeSeries(growthRows);
    const inflSeries   = buildTimeSeries(inflRows);
    const unemplSeries = buildTimeSeries(unemplRows);
    const gdpCapSeries = buildTimeSeries(gdpCapRows);
    const fdiSeries    = buildTimeSeries(fdiRows);
    const expSeries    = buildTimeSeries(expRows);
    const debtSeries   = buildTimeSeries(debtRows);

    // Collect country metadata from GDP rows
    const metaMap: Record<string, { name: string; code3: string }> = {};
    for (const r of gdpRows) {
      const code = r.countryiso3code || r.country?.id;
      if (code) metaMap[code] = { name: r.country?.value ?? code, code3: code };
    }

    // Build per-country summary
    const countries = COUNTRIES.filter(c => c !== 'WLD').map(c => {
      const gdpTV    = latestValue(gdpSeries[c]    ?? {});
      const grTV     = latestValue(growthSeries[c] ?? {});
      const inflTV   = latestValue(inflSeries[c]   ?? {});
      const unTV     = latestValue(unemplSeries[c] ?? {});
      const gcapTV   = latestValue(gdpCapSeries[c] ?? {});
      const fdiTV    = latestValue(fdiSeries[c]    ?? {});
      const expTV    = latestValue(expSeries[c]    ?? {});
      const debtTV   = latestValue(debtSeries[c]   ?? {});

      // Historical growth trend (last 6 years)
      const growthTrend = Object.entries(growthSeries[c] ?? {})
        .filter(([, v]) => v != null)
        .sort(([a], [b]) => Number(a) - Number(b))
        .slice(-6)
        .map(([year, value]) => ({ year, value: value as number }));

      return {
        code:         c,
        name:         metaMap[c]?.name ?? c,
        gdp:          gdpTV.value,
        gdpYear:      gdpTV.year,
        gdpGrowth:    grTV.value,
        gdpGrowthYear:grTV.year,
        inflation:    inflTV.value,
        inflationYear:inflTV.year,
        unemployment: unTV.value,
        gdpPerCapita: gcapTV.value,
        fdi:          fdiTV.value,
        exports:      expTV.value,
        govDebt:      debtTV.value,
        growthTrend,
      };
    });

    // World aggregates
    const worldGDP    = latestValue(gdpSeries['WLD']    ?? {});
    const worldGrowth = latestValue(growthSeries['WLD'] ?? {});
    const worldInfl   = latestValue(inflSeries['WLD']   ?? {});
    const worldUnempl = latestValue(unemplSeries['WLD'] ?? {});

    // GDP ranking (descending)
    const ranked = [...countries]
      .filter(c => c.gdp != null)
      .sort((a, b) => (b.gdp ?? 0) - (a.gdp ?? 0));

    const indiaRank = ranked.findIndex(c => c.code === 'IN') + 1;

    // Growth trend for chart (all countries, last 6 years)
    const trendYears = [...new Set(
      Object.values(growthSeries).flatMap(s => Object.keys(s))
    )].sort().slice(-6);

    const globalGrowthTrend = trendYears.map(year => {
      const point: Record<string, any> = { year };
      for (const c of COUNTRIES.filter(x => x !== 'WLD')) {
        point[c] = growthSeries[c]?.[year] ?? null;
      }
      return point;
    });

    return NextResponse.json({
      success: true,
      updatedAt: new Date().toISOString(),
      world: {
        gdp:          worldGDP.value,
        gdpYear:      worldGDP.year,
        gdpGrowth:    worldGrowth.value,
        gdpGrowthYear:worldGrowth.year,
        inflation:    worldInfl.value,
        unemployment: worldUnempl.value,
      },
      countries,
      gdpRanking: ranked,
      indiaRank,
      globalGrowthTrend,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
