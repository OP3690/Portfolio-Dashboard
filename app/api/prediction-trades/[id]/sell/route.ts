import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PredictionTrade from '@/lib/models/PredictionTrade';

export const dynamic = 'force-dynamic';

/* ── POST /api/prediction-trades/[id]/sell ──────────────────────────────────
   Add a sell lot to an existing trade.
   Body: { sellDate, sellPrice, sellQuantity, notes? }
─────────────────────────────────────────────────────────────────────────── */
export async function POST(
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
    const { sellDate, sellPrice, sellQuantity, notes } = body;

    if (!sellDate || sellPrice == null || sellQuantity == null) {
      return NextResponse.json(
        { success: false, error: 'sellDate, sellPrice, sellQuantity are required' },
        { status: 400 },
      );
    }

    const sPrice = parseFloat(sellPrice);
    const sQty   = parseFloat(sellQuantity);

    if (sPrice <= 0 || sQty <= 0) {
      return NextResponse.json(
        { success: false, error: 'sellPrice and sellQuantity must be positive' },
        { status: 400 },
      );
    }

    if (sQty > trade.remainingQuantity) {
      return NextResponse.json(
        { success: false, error: `Cannot sell ${sQty} — only ${trade.remainingQuantity} remaining` },
        { status: 400 },
      );
    }

    // Compute P&L for this lot
    const realizedPnL    = (sPrice - trade.buyPrice) * sQty;
    const realizedPnLPct = ((sPrice - trade.buyPrice) / trade.buyPrice) * 100;

    // Push the sell lot
    trade.sells.push({
      sellDate:       new Date(sellDate),
      sellPrice:      sPrice,
      sellQuantity:   sQty,
      realizedPnL,
      realizedPnLPct,
      notes:          notes ?? '',
    } as any);

    // Update aggregates
    trade.soldQuantity      += sQty;
    trade.remainingQuantity -= sQty;
    trade.realizedPnL       += realizedPnL;

    const totalSoldValue = trade.sells.reduce((sum, s) => sum + s.sellPrice * s.sellQuantity, 0);
    const totalSoldQty   = trade.soldQuantity;
    const costOfSold     = trade.buyPrice * totalSoldQty;
    trade.realizedPnLPct = costOfSold > 0 ? ((totalSoldValue - costOfSold) / costOfSold) * 100 : 0;

    // Update status
    if (trade.remainingQuantity <= 0) {
      trade.status = 'closed';
    } else if (trade.soldQuantity > 0) {
      trade.status = 'partial';
    }

    await trade.save();

    return NextResponse.json({ success: true, trade });
  } catch (err: any) {
    console.error('POST sell error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
