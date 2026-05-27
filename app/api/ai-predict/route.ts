import { NextResponse } from 'next/server';
import { runDailyPrediction } from '@/lib/aiServices/predictor';

export async function POST() {
  try {
    const results = await runDailyPrediction();
    return NextResponse.json({ success: true, predictions: results, count: results.length });
  } catch (error: any) {
    console.error('ai-predict error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
