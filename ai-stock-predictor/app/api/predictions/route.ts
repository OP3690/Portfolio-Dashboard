import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Prediction from '@/lib/models/Prediction';
import TrackingEntry from '@/lib/models/TrackingEntry';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.firstRecommendedDate = {};
      if (startDate) filter.firstRecommendedDate.$gte = new Date(startDate);
      if (endDate) filter.firstRecommendedDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [predictions, total] = await Promise.all([
      Prediction.find(filter)
        .sort({ firstRecommendedDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Prediction.countDocuments(filter),
    ]);

    // For active predictions, fetch latest tracking data
    const predictionsWithTracking = await Promise.all(
      predictions.map(async (pred) => {
        if (pred.status === 'Active') {
          const latestTracking = await TrackingEntry.findOne({
            predictionId: pred._id,
          })
            .sort({ dayNumber: -1 })
            .limit(1)
            .lean();

          return {
            ...pred,
            latestTracking,
          };
        }
        return pred;
      })
    );

    return NextResponse.json({
      success: true,
      predictions: predictionsWithTracking,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error fetching predictions',
      },
      { status: 500 }
    );
  }
}
