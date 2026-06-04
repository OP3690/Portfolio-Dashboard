import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/* ── GET /api/db-cleanup — preview how much can be freed ───────────────────── */
export async function GET() {
  try {
    await dbConnect();
    const db = mongoose.connection.db!;

    const cutoff90d  = new Date(Date.now() - 90  * 24 * 60 * 60 * 1000);
    const cutoff180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const now        = new Date();

    const [
      oldStockData,
      expiredTracking,
      oldExpiredPredictions,
    ] = await Promise.all([
      // StockData older than 90 days
      db.collection('stockdatas').countDocuments({ date: { $lt: cutoff90d } }),
      // TrackingEntries past their expiresAt (TTL may not have run yet)
      db.collection('trackingentries').countDocuments({ expiresAt: { $lt: now } }),
      // Expired/Missed predictions older than 180 days
      db.collection('predictions').countDocuments({
        status: { $in: ['Expired', 'Missed'] },
        evaluationDate: { $lt: cutoff180d },
      }),
    ]);

    // Collection sizes for context
    const collections = ['stockdatas', 'trackingentries', 'predictions', 'predictiontrades'];
    const sizes = await Promise.all(
      collections.map(async (name) => {
        try {
          const s = await db.command({ collStats: name });
          return { name, storageSize: s.storageSize ?? 0, count: s.count ?? 0 };
        } catch {
          return { name, storageSize: 0, count: 0 };
        }
      }),
    );

    return NextResponse.json({
      success: true,
      preview: {
        oldStockData:           { count: oldStockData,           label: 'StockData records older than 90 days' },
        expiredTracking:        { count: expiredTracking,        label: 'TrackingEntries past expiresAt (TTL backlog)' },
        oldExpiredPredictions:  { count: oldExpiredPredictions,  label: 'Expired/Missed predictions older than 180 days' },
      },
      collectionSizes: sizes.map(s => ({
        name: s.name,
        count: s.count,
        storageSize: s.storageSize,
        storageSizeMB: (s.storageSize / 1024 / 1024).toFixed(2) + ' MB',
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/* ── POST /api/db-cleanup — batch delete to stay within serverless timeout ─── */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const db = mongoose.connection.db!;

    const body = await req.json().catch(() => ({}));
    const {
      deleteOldStockData     = true,
      deleteExpiredTracking  = true,
      deleteOldPredictions   = false,
      stockDataRetainDays    = 90,
      batchSize              = 30000,   // docs to delete per call (keeps us under 60s)
    } = body;

    const cutoff     = new Date(Date.now() - stockDataRetainDays * 24 * 60 * 60 * 1000);
    const cutoff180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const now        = new Date();

    const results: Record<string, any> = {};

    // ── StockData — batch by finding IDs first then deleting ──────────────────
    if (deleteOldStockData) {
      const ids = await db
        .collection('stockdatas')
        .find({ date: { $lt: cutoff } }, { projection: { _id: 1 } })
        .limit(batchSize)
        .toArray();

      let deleted = 0;
      if (ids.length > 0) {
        const r = await db.collection('stockdatas').deleteMany({
          _id: { $in: ids.map((d: any) => d._id) },
        });
        deleted = r.deletedCount;
      }

      // Count remaining after this batch
      const remaining = await db.collection('stockdatas').countDocuments({ date: { $lt: cutoff } });

      results.oldStockData = {
        deleted,
        remaining,
        label: `StockData older than ${stockDataRetainDays} days`,
        done: remaining === 0,
      };
    }

    if (deleteExpiredTracking) {
      const r = await db.collection('trackingentries').deleteMany({ expiresAt: { $lt: now } });
      results.expiredTracking = {
        deleted: r.deletedCount,
        remaining: 0,
        label: 'TrackingEntries past expiresAt',
        done: true,
      };
    }

    if (deleteOldPredictions) {
      const r = await db.collection('predictions').deleteMany({
        status: { $in: ['Expired', 'Missed'] },
        evaluationDate: { $lt: cutoff180d },
      });
      results.oldPredictions = {
        deleted: r.deletedCount,
        remaining: 0,
        label: 'Expired/Missed predictions older than 180 days',
        done: true,
      };
    }

    const totalDeleted = Object.values(results).reduce((s: number, r: any) => s + r.deleted, 0);
    const allDone      = Object.values(results).every((r: any) => r.done);

    return NextResponse.json({
      success: true,
      message: allDone
        ? `Cleanup complete — ${totalDeleted} documents removed`
        : `Batch complete — ${totalDeleted} removed this pass. Call again to continue.`,
      allDone,
      results,
    });
  } catch (err: any) {
    console.error('db-cleanup POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
