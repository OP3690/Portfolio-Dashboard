import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CorporateInfo from '@/models/CorporateInfo';
import StockMaster from '@/models/StockMaster';
import { fetchNSECorporateData } from '@/lib/nseCorporateDataService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/corporate-data?isin=XXX or ?symbol=XXX
 * Fetch corporate data for a stock
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const isin = searchParams.get('isin');
    const symbol = searchParams.get('symbol');

    if (!isin && !symbol) {
      return NextResponse.json(
        { success: false, error: 'Please provide either isin or symbol parameter' },
        { status: 400 }
      );
    }

    // Find stock from StockMaster
    let stockMaster: any = null;
    if (isin) {
      stockMaster = await StockMaster.findOne({ isin }).lean();
    } else if (symbol) {
      stockMaster = await StockMaster.findOne({ symbol: symbol.toUpperCase() }).lean();
    }

    if (!stockMaster) {
      return NextResponse.json(
        { success: false, error: 'Stock not found in database' },
        { status: 404 }
      );
    }

    const stockIsin = stockMaster.isin;
    const stockSymbol = stockMaster.symbol || symbol?.toUpperCase() || '';

    // Check if we have corporate data in database
    let corporateInfo: any = await CorporateInfo.findOne({ isin: stockIsin }).lean();

    // If data is older than 7 days or doesn't exist, fetch fresh data
    const shouldRefresh = !corporateInfo || Array.isArray(corporateInfo) || 
      (corporateInfo.lastUpdated && 
       (Date.now() - new Date(corporateInfo.lastUpdated).getTime()) > 7 * 24 * 60 * 60 * 1000);

    if (shouldRefresh && stockSymbol) {
      try {
        console.log(`📊 Attempting to fetch corporate data for ${stockSymbol} (${stockIsin})...`);
        const freshData = await fetchNSECorporateData(stockSymbol);

        // Check if we got meaningful data
        const hasData = (freshData.financialResults && freshData.financialResults.length > 0) ||
                       (freshData.shareholdingPatterns && freshData.shareholdingPatterns.length > 0) ||
                       (freshData.announcements && freshData.announcements.length > 0) ||
                       (freshData.corporateActions && freshData.corporateActions.length > 0) ||
                       (freshData.boardMeetings && freshData.boardMeetings.length > 0);

        if (hasData) {
          // Filter corporate actions and board meetings to only keep future dates
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const filteredCorporateActions = freshData.corporateActions?.filter((action: any) => {
            const actionDate = new Date(action.date);
            actionDate.setHours(0, 0, 0, 0);
            return actionDate >= today;
          });
          
          const filteredBoardMeetings = freshData.boardMeetings?.filter((meeting: any) => {
            const meetingDate = new Date(meeting.date);
            meetingDate.setHours(0, 0, 0, 0);
            return meetingDate >= today;
          });
          
          // Update or create CorporateInfo record
          const updateData: any = {
            isin: stockIsin,
            symbol: stockSymbol,
            stockName: stockMaster.stockName,
            lastUpdated: new Date(),
          };

          if (freshData.announcements && freshData.announcements.length > 0) {
            updateData.announcements = freshData.announcements;
          }
          if (filteredCorporateActions && filteredCorporateActions.length > 0) {
            updateData.corporateActions = filteredCorporateActions;
          }
          if (filteredBoardMeetings && filteredBoardMeetings.length > 0) {
            updateData.boardMeetings = filteredBoardMeetings;
          }
          if (freshData.financialResults && freshData.financialResults.length > 0) {
            updateData.financialResults = freshData.financialResults;
          }
          if (freshData.shareholdingPatterns && freshData.shareholdingPatterns.length > 0) {
            updateData.shareholdingPatterns = freshData.shareholdingPatterns;
          }

          try {
            corporateInfo = await CorporateInfo.findOneAndUpdate(
              { isin: stockIsin },
              { $set: updateData },
              { upsert: true, new: true }
            ).lean();
            console.log(`✅ Corporate data updated for ${stockSymbol}`);
          } catch (dbError: any) {
            // Handle database space quota errors gracefully
            if (dbError.message && dbError.message.includes('space quota')) {
              console.warn(`⚠️ Database space quota exceeded. Cannot store corporate data for ${stockSymbol}`);
            } else {
              throw dbError;
            }
          }
        } else {
          console.log(`⚠️ No corporate data available from NSE API for ${stockSymbol}`);
        }
      } catch (error: any) {
        console.error(`⚠️ Error fetching fresh corporate data: ${error.message}`);
        // Continue with existing data if available
      }
    }

    // Filter out old corporate actions and board meetings (only keep future dates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const filteredCorporateActions = (corporateInfo?.corporateActions || []).filter((action: any) => {
      const actionDate = new Date(action.date);
      actionDate.setHours(0, 0, 0, 0);
      return actionDate >= today;
    });
    
    const filteredBoardMeetings = (corporateInfo?.boardMeetings || []).filter((meeting: any) => {
      const meetingDate = new Date(meeting.date);
      meetingDate.setHours(0, 0, 0, 0);
      return meetingDate >= today;
    });

    // Normalize shareholding patterns: if values are in decimal format (0.57 instead of 57), multiply by 100
    let normalizedShareholdingPatterns = corporateInfo?.shareholdingPatterns || [];
    if (normalizedShareholdingPatterns.length > 0) {
      normalizedShareholdingPatterns = normalizedShareholdingPatterns.map((pattern: any) => {
        const normalizedPattern = { ...pattern };
        const total = pattern.total || 0;
        
        // If total is around 1 (or less than 2), values are likely in decimal format
        if (total > 0 && total < 2) {
          if (normalizedPattern.promoterAndPromoterGroup && normalizedPattern.promoterAndPromoterGroup < 1) {
            normalizedPattern.promoterAndPromoterGroup = normalizedPattern.promoterAndPromoterGroup * 100;
          }
          if (normalizedPattern.public && normalizedPattern.public < 1) {
            normalizedPattern.public = normalizedPattern.public * 100;
          }
          if (normalizedPattern.sharesHeldByEmployeeTrusts && normalizedPattern.sharesHeldByEmployeeTrusts < 1) {
            normalizedPattern.sharesHeldByEmployeeTrusts = normalizedPattern.sharesHeldByEmployeeTrusts * 100;
          }
          if (normalizedPattern.foreignInstitutionalInvestors && normalizedPattern.foreignInstitutionalInvestors < 1) {
            normalizedPattern.foreignInstitutionalInvestors = normalizedPattern.foreignInstitutionalInvestors * 100;
          }
          if (normalizedPattern.domesticInstitutionalInvestors && normalizedPattern.domesticInstitutionalInvestors < 1) {
            normalizedPattern.domesticInstitutionalInvestors = normalizedPattern.domesticInstitutionalInvestors * 100;
          }
          if (normalizedPattern.other && normalizedPattern.other < 1) {
            normalizedPattern.other = normalizedPattern.other * 100;
          }
          normalizedPattern.total = normalizedPattern.total * 100;
        }
        
        return normalizedPattern;
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        announcements: corporateInfo?.announcements || [],
        corporateActions: filteredCorporateActions,
        boardMeetings: filteredBoardMeetings,
        financialResults: corporateInfo?.financialResults || [],
        shareholdingPatterns: normalizedShareholdingPatterns,
        lastUpdated: corporateInfo?.lastUpdated || null,
      },
    });
  } catch (error: any) {
    console.error('❌ Error in corporate-data API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

