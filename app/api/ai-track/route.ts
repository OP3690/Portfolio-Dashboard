import { NextResponse } from 'next/server';
import { updateDailyTracking } from '@/lib/aiServices/tracker';

export async function POST() {
  try {
    const result = await updateDailyTracking();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('ai-track error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
