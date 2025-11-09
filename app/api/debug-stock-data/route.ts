import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const isinParam = searchParams.get('isin') || 'INE205A01025'; // Default to Vedanta
    
    const normalizedIsin = (isinParam || '').toUpperCase().trim();
    
    console.log(`\n🔍 DEBUG: Checking data for ISIN: ${normalizedIsin}\n`);
    
    // Check StockMaster
    const stock = await StockMaster.findOne({ isin: normalizedIsin }).lean();
    console.log('StockMaster:', stock ? { isin: (stock as any).isin, symbol: (stock as any).symbol, name: (stock as any).stockName } : 'NOT FOUND');
    
    // Try case-insensitive
    if (!stock) {
      const stockCI = await StockMaster.findOne({ 
        isin: { $regex: new RegExp(`^${normalizedIsin}$`, 'i') } 
      }).lean();
      console.log('StockMaster (case-insensitive):', stockCI ? { isin: (stockCI as any).isin, symbol: (stockCI as any).symbol } : 'NOT FOUND');
    }
    
    const actualIsin = stock ? (stock as any).isin : normalizedIsin;
    
    // Count all records
    const totalCount = await StockData.countDocuments({
      $or: [
        { isin: actualIsin },
        { isin: { $regex: new RegExp(`^${actualIsin}$`, 'i') } }
      ]
    });
    console.log(`Total records: ${totalCount}`);
    
    // Get date range
    const dateRange = await StockData.aggregate([
      {
        $match: {
          $or: [
            { isin: actualIsin },
            { isin: { $regex: new RegExp(`^${actualIsin}$`, 'i') } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          minDate: { $min: '$date' },
          maxDate: { $max: '$date' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('Date range:', dateRange[0] || 'No data');
    
    // Get sample records
    const samples = await StockData.find({
      $or: [
        { isin: actualIsin },
        { isin: { $regex: new RegExp(`^${actualIsin}$`, 'i') } }
      ]
    })
      .sort({ date: -1 })
      .limit(10)
      .select('date isin close')
      .lean();
    
    console.log('Sample records (latest 10):');
    samples.forEach((s: any) => {
      console.log(`  ${s.date?.toISOString().split('T')[0]} | ISIN: ${s.isin} | Close: ${s.close}`);
    });
    
    // Test the actual query we use in the API
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999));
    const startDateUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    startDateUTC.setUTCDate(startDateUTC.getUTCDate() - 1095);
    startDateUTC.setUTCHours(0, 0, 0, 0);
    
    const queryResult = await StockData.find({
      isin: actualIsin,
      date: { $gte: startDateUTC, $lte: todayUTC }
    })
      .sort({ date: 1 })
      .select('date open high low close volume')
      .lean();
    
    console.log(`\nQuery result (last 3 years): ${queryResult.length} records`);
    console.log(`Query range: ${startDateUTC.toISOString()} to ${todayUTC.toISOString()}`);
    
    // Check all ISIN formats in database
    const allIsins = await StockData.distinct('isin', {
      $or: [
        { isin: actualIsin },
        { isin: { $regex: new RegExp(`^${actualIsin}$`, 'i') } }
      ]
    });
    
    return NextResponse.json({
      success: true,
      debug: {
        requestedIsin: normalizedIsin,
        actualIsin: actualIsin,
        stockMaster: stock ? {
          isin: (stock as any).isin,
          symbol: (stock as any).symbol,
          name: (stock as any).stockName
        } : null,
        totalRecords: totalCount,
        dateRange: dateRange[0] || null,
        sampleRecords: samples.map((s: any) => ({
          date: s.date,
          isin: s.isin,
          close: s.close
        })),
        queryResult: {
          count: queryResult.length,
          dateRange: {
            start: startDateUTC.toISOString(),
            end: todayUTC.toISOString()
          },
          firstRecord: queryResult[0] ? {
            date: queryResult[0].date,
            close: queryResult[0].close
          } : null,
          lastRecord: queryResult[queryResult.length - 1] ? {
            date: queryResult[queryResult.length - 1].date,
            close: queryResult[queryResult.length - 1].close
          } : null
        },
        allIsinFormats: allIsins
      }
    });
  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

