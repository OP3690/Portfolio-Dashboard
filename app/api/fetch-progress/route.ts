import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';

/**
 * GET endpoint to check progress of data fetching
 * Returns statistics about how many stocks have data
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const allStocks = await StockMaster.find({}).select('isin').lean();
    const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
    
    // Check how many stocks have comprehensive data (with fundamentals)
    const stats = await Promise.all(
      uniqueIsins.map(async (isin) => {
        const count = await StockData.countDocuments({ isin });
        const withFundamentals = await StockData.countDocuments({ 
          isin, 
          $or: [
            { trailingPE: { $exists: true, $ne: null } },
            { marketCap: { $exists: true, $ne: null } },
            { fiftyTwoWeekHigh: { $exists: true, $ne: null } }
          ]
        });
        
        // Get date range
        const firstDate = await StockData.findOne({ isin }).sort({ date: 1 }).select('date').lean() as any;
        const lastDate = await StockData.findOne({ isin }).sort({ date: -1 }).select('date').lean() as any;
        
        return {
          isin,
          totalRecords: count,
          hasFundamentals: withFundamentals > 0,
          firstDate: (firstDate && !Array.isArray(firstDate) && firstDate.date) ? firstDate.date : null,
          lastDate: (lastDate && !Array.isArray(lastDate) && lastDate.date) ? lastDate.date : null,
        };
      })
    );
    
    const totalRecords = stats.reduce((sum, s) => sum + s.totalRecords, 0);
    const stocksWithFundamentals = stats.filter(s => s.hasFundamentals).length;
    const stocksWithData = stats.filter(s => s.totalRecords > 0).length;
    
    return NextResponse.json({
      success: true,
      progress: {
        totalStocks: uniqueIsins.length,
        stocksWithData,
        stocksWithFundamentals,
        totalRecords,
        stocks: stats.slice(0, 10), // First 10 for preview
      },
    });
  } catch (error: any) {
    console.error('Error checking fetch progress:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check progress' },
      { status: 500 }
    );
  }
}

