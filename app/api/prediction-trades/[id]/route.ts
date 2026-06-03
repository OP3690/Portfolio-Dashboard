import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PredictionTrade from '@/lib/models/PredictionTrade';

export const dynamic = 'force-dynamic';

/* ── PATCH /api/prediction-trades/[id] ──────────────────────────────────────
   Modify the buy details of an existing trade.
   Body: { buyDate?, buyPrice?, buyQuantity?, notes? }
─────────────────────────────────────────────────────────────────────────── */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await dbConnect();

    const trade = await PredictionTrade.findById(params.id);
    if (!trade) {
      return NextResponse.json({ success: false, error: 'Trade not found' }, { status: 404 });
    }

    const body = await req.json();
    const { buyDate, buyPrice, buyQuantity, notes } = body;

    if (buyDate)     trade.buyDate      = new Date(buyDate);
    if (buyPrice != null) {
      const p = parseFloat(buyPrice);
      if (p <= 0) return NextResponse.json({ success: false, error: 'buyPrice must be positive' }, { status: 400 });
      trade.buyPrice = p;
    }
    if (buyQuantity != null) {
      const q = parseFloat(buyQuantity);
      if (q <= 0) return NextResponse.json({ success: false, error: 'buyQuantity must be positive' }, { status: 400 });
      // Cannot reduce below already-sold quantity
      if (q < trade.soldQuantity) {
        return NextResponse.json(
          { success: false, error: `Cannot set quantity below already sold (${trade.soldQuantity})` },
          { status: 400 },
        );
      }
      trade.buyQuantity      = q;
      trade.remainingQuantity = q - trade.soldQuantity;
    }
    if (notes !== undefined) trade.notes = notes;

    // Recompute derived fields
    trade.totalInvested = trade.buyPrice * trade.buyQuantity;
    // Recalc realizedPnLPct from stored realizedPnL
    trade.realizedPnLPct = trade.totalInvested > 0
      ? (trade.realizedPnL / trade.totalInvested) * 100
      : 0;

    // Status update: if remaining > 0 and sells exist → partial, else original logic
    if (trade.remainingQuantity <= 0) {
      trade.status = 'closed';
    } else if (trade.soldQuantity > 0) {
      trade.status = 'partial';
    } else {
      trade.status = 'holding';
    }

    await trade.save();
    return NextResponse.json({ success: true, trade });
  } catch (err: any) {
    console.error('PATCH prediction-trades error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/* ── DELETE /api/prediction-trades/[id] ─────────────────────────────────────
   Permanently discard (delete) a recorded trade.
─────────────────────────────────────────────────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await dbConnect();

    const trade = await PredictionTrade.findByIdAndDelete(params.id);
    if (!trade) {
      return NextResponse.json({ success: false, error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: params.id });
  } catch (err: any) {
    console.error('DELETE prediction-trades error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
