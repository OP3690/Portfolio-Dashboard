import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Prediction from '@/lib/models/Prediction';
import TrackingEntry from '@/lib/models/TrackingEntry';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/** Return only Mon–Fri dates between start and end (inclusive) */
function tradingDatesBetween(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  while (cur.getTime() <= endMs) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(cur.toISOString().slice(0, 10)); // YYYY-MM-DD
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') || 'all'; // 'all' | 'Active' | etc.

    const filter: Record<string, any> = {};
    if (statusFilter !== 'all') filter.status = statusFilter;

    // Fetch predictions sorted by recommendation date
    const predictions = await Prediction.find(filter)
      .sort({ firstRecommendedDate: -1 })
      .limit(50)
      .lean();

    if (predictions.length === 0) {
      return NextResponse.json({ success: true, predictions: [], tradingDates: [] });
    }

    // Fetch ALL tracking entries for these predictions in one query
    const predIds = predictions.map((p: any) => new mongoose.Types.ObjectId(p._id));
    const allEntries = await TrackingEntry.find({ predictionId: { $in: predIds } })
      .sort({ date: 1 })
      .lean();

    // Group entries by predictionId
    const entriesByPred = new Map<string, any[]>();
    for (const entry of allEntries) {
      const key = entry.predictionId.toString();
      if (!entriesByPred.has(key)) entriesByPred.set(key, []);
      entriesByPred.get(key)!.push(entry);
    }

    // Determine the global trading-day date range
    const earliestDate = predictions.reduce((min: Date, p: any) =>
      new Date(p.firstRecommendedDate) < min ? new Date(p.firstRecommendedDate) : min,
      new Date(predictions[0].firstRecommendedDate)
    );
    const today = new Date();
    const tradingDates = tradingDatesBetween(earliestDate, today);

    // Build enriched prediction rows
    const enriched = predictions.map((p: any) => {
      const entries = entriesByPred.get(p._id.toString()) ?? [];

      // Build a map: dateStr → entry
      const entryMap = new Map<string, any>();
      for (const e of entries) {
        entryMap.set(new Date(e.date).toISOString().slice(0, 10), e);
      }

      // Inject a synthetic Day-0 entry on the recommendation date (0% change)
      const recDateStr = new Date(p.firstRecommendedDate).toISOString().slice(0, 10);
      if (!entryMap.has(recDateStr)) {
        entryMap.set(recDateStr, {
          date:         p.firstRecommendedDate,
          closingPrice: p.entryPrice,
          dailyChange:  0,
          totalReturn:  0,
          dayNumber:    0,
          synthetic:    true,
        });
      }

      // Get the latest total return (from last tracking entry or bestReturn)
      const sortedEntries = [...entryMap.values()].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const latestEntry   = sortedEntries[sortedEntries.length - 1];
      const currentReturn = latestEntry?.totalReturn ?? p.bestReturn ?? 0;

      return {
        _id:                 p._id,
        stockSymbol:         p.stockSymbol,
        stockName:           p.stockName,
        firstRecommendedDate: p.firstRecommendedDate,
        entryPrice:          p.entryPrice,
        recommendationCount: p.recommendationCount,
        targetReturn:        p.targetReturn ?? 5,
        status:              p.status,
        currentReturn,
        confidenceScore:     p.confidenceScore,
        regime:              p.regime ?? null,
        mcProbability:       p.mcProbability ?? null,
        backtestWinRate:     p.backtestWinRate ?? null,
        // date → daily tracking cell
        dailyMap: Object.fromEntries(
          [...entryMap.entries()].map(([dateStr, e]) => [
            dateStr,
            {
              dailyChange:  e.dailyChange,
              totalReturn:  e.totalReturn,
              closingPrice: e.closingPrice,
              dayNumber:    e.dayNumber ?? 0,
              synthetic:    e.synthetic ?? false,
            },
          ])
        ),
      };
    });

    return NextResponse.json({
      success: true,
      predictions: enriched,
      tradingDates,   // ordered list of YYYY-MM-DD strings
    });
  } catch (error: any) {
    console.error('ai-tracking-history error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
