import { NextResponse } from 'next/server';
import { recalibrateWeights } from '@/lib/aiServices/recalibrator';

export async function POST() {
  try {
    const result = await recalibrateWeights();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('ai-recalibrate error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
