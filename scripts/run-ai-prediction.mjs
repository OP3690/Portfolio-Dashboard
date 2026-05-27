#!/usr/bin/env node
/**
 * run-ai-prediction.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone daily prediction runner.
 *
 * Calls the deployed API endpoint so you don't have to duplicate any DB logic
 * locally. Works on any machine that can reach your Vercel deployment.
 *
 * USAGE
 * ─────
 * Direct run:
 *   node scripts/run-ai-prediction.mjs
 *
 * With a custom base URL (e.g. local dev server):
 *   BASE_URL=http://localhost:3000 node scripts/run-ai-prediction.mjs
 *
 * SCHEDULE WITH SYSTEM CRONTAB (Linux / macOS)
 * ─────────────────────────────────────────────
 *   crontab -e
 *   # Add this line — runs at 05:00 AM IST every day:
 *   30 23 * * * /usr/bin/node /path/to/scripts/run-ai-prediction.mjs >> /var/log/ai-prediction.log 2>&1
 *
 * SCHEDULE WITH PM2 (if you run the Next.js app with PM2)
 * ────────────────────────────────────────────────────────
 *   pm2 start scripts/run-ai-prediction.mjs --name ai-prediction-cron \
 *       --cron "30 23 * * *" --no-autorestart
 *
 * SCHEDULE WITH WINDOWS TASK SCHEDULER
 * ──────────────────────────────────────
 *   1. Open Task Scheduler → Create Basic Task
 *   2. Trigger: Daily at 05:00 AM
 *   3. Action: Start a program
 *      Program: node
 *      Arguments: C:\path\to\scripts\run-ai-prediction.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import https from 'https';
import http  from 'http';
import path  from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream, mkdirSync } from 'fs';

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL   = (process.env.BASE_URL || 'https://portfolio-dashboard-pi-weld.vercel.app').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY || '';

// Log file next to this script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.join(__dirname, '../logs');
mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE  = path.join(LOG_DIR, 'ai-prediction.log');
const logStream = createWriteStream(LOG_FILE, { flags: 'a' });

// ── Logger ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (CRON_SECRET) headers['Authorization'] = `Bearer ${CRON_SECRET}`;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   options.method || 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  log('══════════════════════════════════════════════════════════════');
  log(`🤖  AI Prediction Runner — ${startedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  log(`🌐  Target: ${BASE_URL}`);
  log('══════════════════════════════════════════════════════════════');

  let overallSuccess = true;

  // ── Step 1: Run prediction ────────────────────────────────────────────────
  log('\n📊  Step 1/3 — Running daily stock prediction…');
  try {
    const res = await request(`${BASE_URL}/api/ai-predict`, { method: 'POST' });
    if (res.status === 200 && res.body?.success) {
      log(`✅  Prediction complete — ${res.body.count} stock(s) selected`);
      (res.body.predictions || []).forEach((p) =>
        log(`    • ${p.stockSymbol}  conf=${p.confidenceScore}%  ${p.isNew ? '(NEW)' : '(updated)'}`)
      );
    } else {
      log(`❌  Prediction failed [HTTP ${res.status}]: ${res.body?.error || JSON.stringify(res.body)}`);
      overallSuccess = false;
    }
  } catch (e) {
    log(`❌  Prediction request error: ${e.message}`);
    overallSuccess = false;
  }

  // ── Step 2: Update tracking ───────────────────────────────────────────────
  log('\n📈  Step 2/3 — Updating tracking for active predictions…');
  try {
    const res = await request(`${BASE_URL}/api/ai-track`, { method: 'POST' });
    if (res.status === 200 && res.body?.success) {
      log(`✅  Tracking updated:`);
      log(`    • Updated:   ${res.body.updatedCount}`);
      log(`    • Evaluated: ${res.body.evaluatedCount}`);
      log(`    • Expired:   ${res.body.expiredCount}`);
    } else {
      log(`❌  Tracking failed [HTTP ${res.status}]: ${res.body?.error || JSON.stringify(res.body)}`);
      overallSuccess = false;
    }
  } catch (e) {
    log(`❌  Tracking request error: ${e.message}`);
    overallSuccess = false;
  }

  // ── Step 3: Recalibrate if enough data ───────────────────────────────────
  log('\n⚙️   Step 3/3 — Checking if recalibration is due…');
  try {
    // Fetch stats first to see if we have enough evaluated predictions
    const statsRes = await request(`${BASE_URL}/api/ai-predictions?status=all&limit=1`);
    const totalEvaluated = statsRes.body?.stats?.totalEvaluated ?? 0;

    if (totalEvaluated >= 10) {
      const res = await request(`${BASE_URL}/api/ai-recalibrate`, { method: 'POST' });
      if (res.status === 200 && res.body?.success) {
        log(`✅  Recalibration: ${res.body.message}`);
      } else {
        log(`⚠️   Recalibration skipped: ${res.body?.message || res.body?.error}`);
      }
    } else {
      log(`ℹ️   Recalibration skipped — need 10+ evaluated predictions, have ${totalEvaluated}`);
    }
  } catch (e) {
    log(`⚠️   Recalibration check error: ${e.message}`);
    // Not critical — don't fail overall
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const durationSec = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  log('\n══════════════════════════════════════════════════════════════');
  log(`${overallSuccess ? '✅  All steps succeeded' : '⚠️   Completed with errors'}  |  duration: ${durationSec}s`);
  log(`📁  Log file: ${LOG_FILE}`);
  log('══════════════════════════════════════════════════════════════\n');

  logStream.end();
  process.exit(overallSuccess ? 0 : 1);
}

main().catch((e) => {
  log(`💥  Fatal error: ${e.message}`);
  logStream.end();
  process.exit(1);
});
