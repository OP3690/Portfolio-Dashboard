import { NextRequest, NextResponse } from 'next/server';
import { runDailyPrediction } from '@/lib/aiServices/predictor';
import { updateDailyTracking } from '@/lib/aiServices/tracker';

// Must be dynamic — cron routes cannot be statically rendered
export const dynamic = 'force-dynamic';

/**
 * Daily AI Prediction Cron Job
 * ─────────────────────────────────────────────────────────────
 * Scheduled by Vercel Cron at 23:30 UTC = 05:00 AM IST every day.
 * Vercel calls this route as an authenticated GET request.
 *
 * What it does (in order):
 *   1. runDailyPrediction() — score all NSE stocks, pick top 3, upsert to DB
 *   2. updateDailyTracking() — refresh P&L for all active predictions
 *
 * Security: Vercel Cron attaches the "Authorization: Bearer <CRON_SECRET>"
 * header automatically when a CRON_SECRET env var is set. We validate it
 * here so the endpoint cannot be triggered by strangers.
 *
 * Manual test:
 *   curl -X GET https://<your-domain>/api/cron/ai-prediction \
 *        -H "Authorization: Bearer <CRON_SECRET>"
 */
export async function GET(request: NextRequest) {
  const startedAt = new Date();
  const log: string[] = [];

  const info  = (msg: string) => { console.log(msg);  log.push(msg); };
  const error = (msg: string) => { console.error(msg); log.push(`ERROR: ${msg}`); };

  info('══════════════════════════════════════════════════');
  info(`🤖  AI Prediction Cron — started at ${startedAt.toISOString()}`);
  info(`🕐  IST: ${startedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  info('══════════════════════════════════════════════════');

  // ── Auth guard ──────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET ?? process.env.CRON_SECRET_KEY;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const provided   = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (provided !== cronSecret) {
      error('Unauthorized — invalid or missing CRON_SECRET');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result: {
    prediction?: { count: number; stocks: string[] };
    tracking?:   { updatedCount: number; evaluatedCount: number; expiredCount: number };
    errors:      string[];
    durationMs:  number;
    ranAt:       string;
    istTime:     string;
  } = {
    errors:   [],
    durationMs: 0,
    ranAt:    startedAt.toISOString(),
    istTime:  startedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  };

  // ── Step 1: Run prediction ──────────────────────────────────
  try {
    info('\n📊  Step 1/2 — Running daily prediction engine…');
    const predictions = await runDailyPrediction();
    result.prediction = {
      count:  predictions.length,
      stocks: predictions.map((p) => `${p.stockSymbol} (${p.confidenceScore}% conf, ${p.isNew ? 'NEW' : 'updated'})`),
    };
    info(`✅  Prediction done — ${predictions.length} stock(s) selected:`);
    result.prediction.stocks.forEach((s) => info(`    • ${s}`));
  } catch (e: any) {
    const msg = `Prediction failed: ${e.message}`;
    error(msg);
    result.errors.push(msg);
  }

  // ── Step 2: Update tracking ─────────────────────────────────
  try {
    info('\n📈  Step 2/2 — Updating daily tracking for active predictions…');
    const tracking = await updateDailyTracking();
    result.tracking = tracking;
    info(`✅  Tracking done:`);
    info(`    • Updated:   ${tracking.updatedCount}`);
    info(`    • Evaluated: ${tracking.evaluatedCount}`);
    info(`    • Expired:   ${tracking.expiredCount}`);
  } catch (e: any) {
    const msg = `Tracking failed: ${e.message}`;
    error(msg);
    result.errors.push(msg);
  }

  // ── Summary ─────────────────────────────────────────────────
  const durationMs    = Date.now() - startedAt.getTime();
  result.durationMs   = durationMs;
  const success       = result.errors.length === 0;

  info('\n══════════════════════════════════════════════════');
  info(`${success ? '✅' : '⚠️ '} Cron finished in ${(durationMs / 1000).toFixed(1)}s  |  errors: ${result.errors.length}`);
  info('══════════════════════════════════════════════════');

  return NextResponse.json({ success, ...result }, { status: success ? 200 : 207 });
}
