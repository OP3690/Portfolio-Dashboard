import connectDB from './mongodb';
import StockMaster from '@/models/StockMaster';
import CorporateInfo from '@/models/CorporateInfo';
import { fetchNSECorporateData } from './nseCorporateDataService';

/**
 * Process all stocks and update corporate data
 * Fetches from NSE API and stores in CorporateInfo collection
 */
export async function processAllStocksCorporateData(): Promise<{
  total: number;
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  await connectDB();

  const allStocks = await StockMaster.find({ exchange: 'NSE' })
    .select('isin symbol stockName')
    .lean();

  console.log(`📊 Processing ${allStocks.length} stocks for corporate data...`);

  // Check which stocks already have data
  const existing = await CorporateInfo.find({})
    .select('isin lastUpdated')
    .lean();
  const existingMap = new Map();
  existing.forEach((e: any) => {
    existingMap.set(e.isin, e.lastUpdated);
  });

  const stats = {
    total: allStocks.length,
    processed: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const BATCH_SIZE = 10; // Process 10 at a time to avoid rate limiting

  for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
    const batch = allStocks.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (stock: any) => {
      try {
        if (!stock.symbol) {
          stats.skipped++;
          return;
        }

        const corporateData = await fetchNSECorporateData(stock.symbol);

        // Only save if we have meaningful data
        const hasData = (corporateData.financialResults && corporateData.financialResults.length > 0) ||
                       (corporateData.shareholdingPatterns && corporateData.shareholdingPatterns.length > 0) ||
                       (corporateData.announcements && corporateData.announcements.length > 0) ||
                       (corporateData.corporateActions && corporateData.corporateActions.length > 0) ||
                       (corporateData.boardMeetings && corporateData.boardMeetings.length > 0);

        if (!hasData) {
          stats.skipped++;
          return;
        }

        // Filter corporate actions and board meetings to only keep future dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const filteredCorporateActions = corporateData.corporateActions?.filter((action: any) => {
          const actionDate = new Date(action.date);
          actionDate.setHours(0, 0, 0, 0);
          return actionDate >= today;
        });
        
        const filteredBoardMeetings = corporateData.boardMeetings?.filter((meeting: any) => {
          const meetingDate = new Date(meeting.date);
          meetingDate.setHours(0, 0, 0, 0);
          return meetingDate >= today;
        });

        const updateData: any = {
          isin: stock.isin,
          symbol: stock.symbol,
          stockName: stock.stockName,
          lastUpdated: new Date(),
        };

        if (corporateData.announcements) updateData.announcements = corporateData.announcements;
        if (filteredCorporateActions && filteredCorporateActions.length > 0) updateData.corporateActions = filteredCorporateActions;
        if (filteredBoardMeetings && filteredBoardMeetings.length > 0) updateData.boardMeetings = filteredBoardMeetings;
        if (corporateData.financialResults) updateData.financialResults = corporateData.financialResults;
        if (corporateData.shareholdingPatterns) updateData.shareholdingPatterns = corporateData.shareholdingPatterns;

        try {
          await CorporateInfo.findOneAndUpdate(
            { isin: stock.isin },
            { $set: updateData },
            { upsert: true }
          );
          stats.updated++;
        } catch (dbError: any) {
          if (dbError.message && dbError.message.includes('space quota')) {
            stats.errors.push(`Database space quota exceeded for ${stock.symbol}`);
            throw dbError;
          }
          throw dbError;
        }

        stats.processed++;
      } catch (error: any) {
        stats.failed++;
        stats.errors.push(`${stock.symbol}: ${error.message}`);
      }
    });

    await Promise.all(batchPromises);

    // Log progress every 50 stocks
    if (stats.processed % 50 === 0) {
      console.log(`   Processed ${stats.processed}/${allStocks.length} stocks... (Updated: ${stats.updated}, Failed: ${stats.failed}, Skipped: ${stats.skipped})`);
    }

    // Delay to avoid rate limiting
    if (i + BATCH_SIZE < allStocks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return stats;
}

