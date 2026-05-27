import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Prediction from '@/lib/models/Prediction';
import ModelWeights from '@/lib/models/ModelWeights';

export async function GET() {
  try {
    await dbConnect();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Overall stats
    const allEvaluated = await Prediction.find({
      status: { $in: ['Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'] },
    }).lean();

    const activeCount = await Prediction.countDocuments({ status: 'Active' });

    // Calculate overall success rate
    const successfulCount = allEvaluated.filter(
      (p) => p.status === 'Achieved' || p.status === 'OverAchieved'
    ).length;
    const overallSuccessRate =
      allEvaluated.length > 0 ? (successfulCount / allEvaluated.length) * 100 : 0;

    // Success rate by time period
    const getPeriodStats = (predictions: typeof allEvaluated) => {
      const total = predictions.length;
      const successful = predictions.filter(
        (p) => p.status === 'Achieved' || p.status === 'OverAchieved'
      ).length;
      const avgReturn =
        total > 0
          ? predictions.reduce((sum, p) => sum + (p.finalReturn || 0), 0) / total
          : 0;
      return { total, successful, successRate: total > 0 ? (successful / total) * 100 : 0, avgReturn };
    };

    const last30 = allEvaluated.filter(
      (p) => p.evaluationDate && p.evaluationDate >= thirtyDaysAgo
    );
    const last60 = allEvaluated.filter(
      (p) => p.evaluationDate && p.evaluationDate >= sixtyDaysAgo
    );
    const last90 = allEvaluated.filter(
      (p) => p.evaluationDate && p.evaluationDate >= ninetyDaysAgo
    );

    // Average return by status category
    const avgReturnByStatus = {
      Achieved:
        allEvaluated.filter((p) => p.status === 'Achieved').length > 0
          ? allEvaluated
              .filter((p) => p.status === 'Achieved')
              .reduce((sum, p) => sum + (p.finalReturn || 0), 0) /
            allEvaluated.filter((p) => p.status === 'Achieved').length
          : 0,
      OverAchieved:
        allEvaluated.filter((p) => p.status === 'OverAchieved').length > 0
          ? allEvaluated
              .filter((p) => p.status === 'OverAchieved')
              .reduce((sum, p) => sum + (p.finalReturn || 0), 0) /
            allEvaluated.filter((p) => p.status === 'OverAchieved').length
          : 0,
      MissedSlightly:
        allEvaluated.filter((p) => p.status === 'MissedSlightly').length > 0
          ? allEvaluated
              .filter((p) => p.status === 'MissedSlightly')
              .reduce((sum, p) => sum + (p.finalReturn || 0), 0) /
            allEvaluated.filter((p) => p.status === 'MissedSlightly').length
          : 0,
      Missed:
        allEvaluated.filter((p) => p.status === 'Missed').length > 0
          ? allEvaluated
              .filter((p) => p.status === 'Missed')
              .reduce((sum, p) => sum + (p.finalReturn || 0), 0) /
            allEvaluated.filter((p) => p.status === 'Missed').length
          : 0,
    };

    // Weight history (last 10 versions)
    const weightHistory = await ModelWeights.find()
      .sort({ date: -1 })
      .limit(10)
      .lean();

    // Indicator performance analysis
    // Find which indicators are most correlated with success
    const indicatorPerformance: Record<string, { avgForSuccess: number; avgForFailure: number }> = {};

    if (allEvaluated.length > 0) {
      const indicatorKeys = ['rsi', 'macdSignal', 'bbPosition', 'volumeRatio', 'momentum10d', 'maCrossover', 'adx'] as const;

      for (const key of indicatorKeys) {
        const successful = allEvaluated.filter(
          (p) => p.status === 'Achieved' || p.status === 'OverAchieved'
        );
        const failed = allEvaluated.filter(
          (p) => p.status === 'Missed' || p.status === 'Expired'
        );

        indicatorPerformance[key] = {
          avgForSuccess:
            successful.length > 0
              ? successful.reduce((sum, p) => sum + (p.indicatorSnapshot?.[key] || 0), 0) /
                successful.length
              : 0,
          avgForFailure:
            failed.length > 0
              ? failed.reduce((sum, p) => sum + (p.indicatorSnapshot?.[key] || 0), 0) /
                failed.length
              : 0,
        };
      }
    }

    // Status distribution
    const statusCounts = {
      Active: activeCount,
      Achieved: allEvaluated.filter((p) => p.status === 'Achieved').length,
      OverAchieved: allEvaluated.filter((p) => p.status === 'OverAchieved').length,
      MissedSlightly: allEvaluated.filter((p) => p.status === 'MissedSlightly').length,
      Missed: allEvaluated.filter((p) => p.status === 'Missed').length,
      Expired: allEvaluated.filter((p) => p.status === 'Expired').length,
    };

    return NextResponse.json({
      success: true,
      analytics: {
        overall: {
          totalPredictions: allEvaluated.length + activeCount,
          activeCount,
          evaluatedCount: allEvaluated.length,
          successfulCount,
          overallSuccessRate,
          avgReturn:
            allEvaluated.length > 0
              ? allEvaluated.reduce((sum, p) => sum + (p.finalReturn || 0), 0) /
                allEvaluated.length
              : 0,
        },
        trends: {
          last30: getPeriodStats(last30),
          last60: getPeriodStats(last60),
          last90: getPeriodStats(last90),
        },
        statusCounts,
        avgReturnByStatus,
        weightHistory,
        indicatorPerformance,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error fetching analytics',
      },
      { status: 500 }
    );
  }
}
