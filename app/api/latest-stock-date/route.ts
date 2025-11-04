import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to get the latest stock date from the database
 * GET /api/latest-stock-date
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    // Get the latest date from StockData collection
    const latestRecord = await StockData.findOne({})
      .sort({ date: -1 })
      .select('date')
      .lean() as any;
    
    if (!latestRecord || Array.isArray(latestRecord) || !latestRecord.date) {
      return NextResponse.json({
        success: true,
        latestDate: null,
        message: 'No stock data found in database',
      });
    }
    
    const latestDate = new Date(latestRecord.date);
    
    return NextResponse.json({
      success: true,
      latestDate: latestDate.toISOString(),
      formattedDate: formatDate(latestDate),
    });
  } catch (error: any) {
    console.error('Error fetching latest stock date:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch latest stock date',
      },
      { status: 500 }
    );
  }
}

/**
 * Format date to DD/MM/YYYY
 */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

