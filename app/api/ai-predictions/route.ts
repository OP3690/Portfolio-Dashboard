import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Prediction from '@/lib/models/Prediction';
import ModelWeights from '@/lib/models/ModelWeights';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const status  = searchParams.get('status');   // 'Active' | 'all' | specific
    const limit   = parseInt(searchParams.get('limit')  || '50');
    const skip    = parseInt(searchParams.get('skip')   || '0');

    const filter: Record<string, any> = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const [predictions, total, activeWeights] = await Promise.all([
      Prediction.find(filter).sort({ latestRecommendedDate: -1 }).skip(skip).limit(limit).lean(),
      Prediction.countDocuments(filter),
      ModelWeights.findOne({ isActive: true }).sort({ date: -1 }).lean(),
    ]);

    // Summary stats
    const allCompleted = await Prediction.find({
      status: { $in: ['Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'] },
    }).lean();

    const totalEvaluated    = allCompleted.length;
    const successCount      = allCompleted.filter((p) => p.status === 'Achieved' || p.status === 'OverAchieved').length;
    const successRate        = totalEvaluated > 0 ? (successCount / totalEvaluated) * 100 : 0;
    const avgReturn          = totalEvaluated > 0
      ? allCompleted.reduce((s: number, p: any) => s + (p.finalReturn || 0), 0) / totalEvaluated
      : 0;

    return NextResponse.json({
      success: true,
      predictions,
      total,
      stats: {
        totalEvaluated,
        successCount,
        successRate: Math.round(successRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
      },
      modelVersion: activeWeights?.version ?? 'v1.0',
      modelWeights: activeWeights?.weights ?? null,
    });
  } catch (error: any) {
    console.error('ai-predictions GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
