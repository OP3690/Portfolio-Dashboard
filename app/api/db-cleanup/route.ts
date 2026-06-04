import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/* ── Retention policy ───────────────────────────────────────────────────────
   - Holdings (stocks you currently own): keep 5 years of OHLCV history
   - All other stocks:                    keep 1 year of OHLCV history
   - TrackingEntries:                     let TTL handle; force-expire backlog
   - Predictions (Expired/Missed):        keep forever (tiny, <1 MB)
────────────────────────────────────────────────────────────────────────── */

/* ── GET /api/db-cleanup — preview deletable counts ────────────────────── */
export async function GET() {
  try {
    await dbConnect();
    const db = mongoose.connection.db!;

    const cutoff1yr  = new Date(Date.now() - 365  * 24 * 60 * 60 * 1000);
    const cutoff5yr  = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const now        = new Date();

    // ISINs of currently held stocks (keep 5 years for these)
    const holdings = await db.collection('holdings').distinct('isin');

    // Count deletable: older than 5yr for holdings, older than 1yr for rest
    const [oldHoldingData, oldNonHoldingData, expiredTracking] = await Promise.all([
      // Holdings data older than 5 years
      db.collection('stockdatas').countDocuments({
        isin: { $in: holdings },
        date: { $lt: cutoff5yr },
      }),
      // Non-holding data older than 1 year
      db.collection('stockdatas').countDocuments({
        isin: { $nin: holdings },
        date: { $lt: cutoff1yr },
      }),
      // TrackingEntries past their expiresAt
      db.collection('trackingentries').countDocuments({ expiresAt: { $lt: now } }),
    ]);

    // Collection sizes
    const collections = ['stockdatas', 'trackingentries', 'predictions', 'predictiontrades', 'holdings', 'corporateinfos'];
    const sizes = await Promise.all(
      collections.map(async (name) => {
        try {
          const s = await db.command({ collStats: name });
          return { name, storageSize: s.storageSize ?? 0, totalIndexSize: s.totalIndexSize ?? 0, count: s.count ?? 0 };
        } catch {
          return { name, storageSize: 0, totalIndexSize: 0, count: 0 };
        }
      }),
    );

    return NextResponse.json({
      success: true,
      retentionPolicy: {
        holdingsCount: holdings.length,
        holdingIsins: holdings.slice(0, 10),
        holdingsRetain: '5 years',
        othersRetain:   '1 year',
      },
      preview: {
        oldHoldingData:    { count: oldHoldingData,    label: 'Holding stocks data older than 5 years' },
        oldNonHoldingData: { count: oldNonHoldingData, label: 'Non-holding stocks data older than 1 year' },
        expiredTracking:   { count: expiredTracking,   label: 'TrackingEntries past expiresAt' },
        total: oldHoldingData + oldNonHoldingData + expiredTracking,
      },
      collectionSizes: sizes.map(s => ({
        name: s.name,
        count: s.count,
        storageMB: (s.storageSize / 1024 / 1024).toFixed(2) + ' MB',
        indexMB:   (s.totalIndexSize / 1024 / 1024).toFixed(2) + ' MB',
        totalMB:   ((s.storageSize + s.totalIndexSize) / 1024 / 1024).toFixed(2) + ' MB',
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/* ── POST /api/db-cleanup — batch delete with smart retention ───────────── */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const db = mongoose.connection.db!;

    const body = await req.json().catch(() => ({}));
    const { batchSize = 30000 } = body;

    const cutoff1yr = new Date(Date.now() - 365  * 24 * 60 * 60 * 1000);
    const cutoff5yr = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const now       = new Date();

    // ISINs of currently held stocks
    const holdings = await db.collection('holdings').distinct('isin');

    const results: Record<string, any> = {};

    // ── Delete holding-stock data older than 5 years ──────────────────────
    {
      const ids = await db
        .collection('stockdatas')
        .find({ isin: { $in: holdings }, date: { $lt: cutoff5yr } }, { projection: { _id: 1 } })
        .limit(batchSize)
        .toArray();

      let deleted = 0;
      if (ids.length > 0) {
        const r = await db.collection('stockdatas').deleteMany({
          _id: { $in: ids.map((d: any) => d._id) },
        });
        deleted = r.deletedCount;
      }
      const remaining = await db.collection('stockdatas').countDocuments({
        isin: { $in: holdings }, date: { $lt: cutoff5yr },
      });
      results.oldHoldingData = { deleted, remaining, label: 'Holding stocks >5yr', done: remaining === 0 };
    }

    // ── Delete non-holding data older than 1 year ────────────────────────
    {
      const ids = await db
        .collection('stockdatas')
        .find({ isin: { $nin: holdings }, date: { $lt: cutoff1yr } }, { projection: { _id: 1 } })
        .limit(batchSize)
        .toArray();

      let deleted = 0;
      if (ids.length > 0) {
        const r = await db.collection('stockdatas').deleteMany({
          _id: { $in: ids.map((d: any) => d._id) },
        });
        deleted = r.deletedCount;
      }
      const remaining = await db.collection('stockdatas').countDocuments({
        isin: { $nin: holdings }, date: { $lt: cutoff1yr },
      });
      results.oldNonHoldingData = { deleted, remaining, label: 'Non-holding stocks >1yr', done: remaining === 0 };
    }

    // ── Clean up expired TrackingEntries ─────────────────────────────────
    {
      const r = await db.collection('trackingentries').deleteMany({ expiresAt: { $lt: now } });
      results.expiredTracking = { deleted: r.deletedCount, remaining: 0, label: 'Expired TrackingEntries', done: true };
    }

    const totalDeleted = Object.values(results).reduce((s: number, r: any) => s + r.deleted, 0);
    const allDone      = Object.values(results).every((r: any) => r.done);

    return NextResponse.json({
      success: true,
      message: allDone
        ? `Cleanup complete — ${totalDeleted} documents removed`
        : `Batch done — ${totalDeleted} removed this pass. Call again to continue.`,
      allDone,
      results,
    });
  } catch (err: any) {
    console.error('db-cleanup POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
