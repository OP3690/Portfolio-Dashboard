import axios from 'axios';

export interface NSECorporateData {
  announcements?: Array<{
    subject: string;
    date: Date;
    description?: string;
  }>;
  corporateActions?: Array<{
    subject: string;
    date: Date;
    exDate?: Date;
    recordDate?: Date;
    description?: string;
    actionType?: string;
  }>;
  boardMeetings?: Array<{
    subject: string;
    date: Date;
    purpose?: string;
    outcome?: string;
  }>;
  financialResults?: Array<{
    quarterEnded: Date;
    totalIncome: number;
    netProfitLoss: number;
    earningsPerShare: number;
    revenue?: number;
    operatingProfit?: number;
    netProfitMargin?: number;
  }>;
  shareholdingPatterns?: Array<{
    periodEnded: Date;
    promoterAndPromoterGroup: number;
    public: number;
    sharesHeldByEmployeeTrusts?: number;
    foreignInstitutionalInvestors?: number;
    domesticInstitutionalInvestors?: number;
    other?: number;
    total: number;
  }>;
}

/**
 * Fetch corporate data from NSE API
 * Uses the correct endpoint: /api/top-corp-info
 */
export async function fetchNSECorporateData(symbol: string): Promise<NSECorporateData> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
    'Origin': 'https://www.nseindia.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  const result: NSECorporateData = {};

  try {
    // Use the correct NSE API endpoint
    const response = await axios.get(
      `https://www.nseindia.com/api/top-corp-info?symbol=${symbol}&market=equities&series=EQ`,
      { headers, timeout: 15000 }
    );

    const data = response.data;

    // Parse latest_announcements
    if (data.latest_announcements?.data && Array.isArray(data.latest_announcements.data)) {
      result.announcements = data.latest_announcements.data
        .filter((item: any) => item.subject && item.broadcastdate)
        .map((item: any) => ({
          subject: item.subject || '',
          date: parseNSEDate(item.broadcastdate),
          description: undefined,
        }))
        .slice(0, 20);
    }

    // Parse corporate_actions - only keep future dates
    if (data.corporate_actions?.data && Array.isArray(data.corporate_actions.data)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      result.corporateActions = data.corporate_actions.data
        .filter((item: any) => item.purpose && item.exdate)
        .map((item: any) => {
          // Extract action type from purpose (e.g., "Dividend", "Bonus", "Split")
          let actionType = 'Other';
          const purpose = (item.purpose || '').toLowerCase();
          if (purpose.includes('dividend')) actionType = 'Dividend';
          else if (purpose.includes('bonus')) actionType = 'Bonus';
          else if (purpose.includes('split')) actionType = 'Split';
          else if (purpose.includes('rights')) actionType = 'Rights';
          else if (purpose.includes('agm') || purpose.includes('annual general meeting')) actionType = 'AGM';

          return {
            subject: item.purpose || '',
            date: parseNSEDate(item.exdate),
            exDate: parseNSEDate(item.exdate),
            recordDate: undefined,
            description: item.purpose || undefined,
            actionType: actionType,
          };
        })
        .filter((action: any) => {
          const actionDate = new Date(action.date);
          actionDate.setHours(0, 0, 0, 0);
          return actionDate >= today; // Only keep future dates
        })
        .slice(0, 20);
    }

    // Parse financial_results
    if (data.financial_results?.data && Array.isArray(data.financial_results.data)) {
      result.financialResults = data.financial_results.data
        .filter((item: any) => item.to_date)
        .map((item: any) => {
          const quarterEnded = parseNSEDate(item.to_date);
          const totalIncome = parseNumber(item.income || item.revenue || '0');
          const netProfitLoss = parseNumber(item.proLossAftTax || item.profitAfterTax || '0');
          const earningsPerShare = parseNumber(item.reDilEPS || item.eps || item.EPS || '0');
          const operatingProfit = parseNumber(item.reProLossBefTax || item.profitBeforeTax || '0');
          
          // Calculate profit margin if we have income and profit
          let netProfitMargin: number | undefined = undefined;
          if (totalIncome > 0 && netProfitLoss !== 0) {
            netProfitMargin = (netProfitLoss / totalIncome) * 100;
          }

          return {
            quarterEnded,
            totalIncome,
            netProfitLoss,
            earningsPerShare,
            revenue: totalIncome, // income is revenue
            operatingProfit,
            netProfitMargin,
          };
        })
        .slice(0, 20); // Last 20 quarters
    }

    // Parse shareholdings_patterns (note: data structure is different - dates as keys)
    if (data.shareholdings_patterns?.data && typeof data.shareholdings_patterns.data === 'object') {
      const patternsData = data.shareholdings_patterns.data;
      result.shareholdingPatterns = Object.entries(patternsData)
        .map(([dateStr, items]: [string, any]) => {
          if (!Array.isArray(items)) return null;

          // Parse the array of objects into a structured format
          const pattern: any = {
            periodEnded: parseNSEDate(dateStr),
            promoterAndPromoterGroup: 0,
            public: 0,
            sharesHeldByEmployeeTrusts: 0,
            total: 100,
          };

          items.forEach((item: any) => {
            const key = Object.keys(item)[0];
            const value = parseNumber(item[key] || '0');
            
            if (key.includes('Promoter') || key.includes('promoter')) {
              pattern.promoterAndPromoterGroup = value;
            } else if (key.includes('Public') || key.includes('public')) {
              pattern.public = value;
            } else if (key.includes('Employee') || key.includes('employee')) {
              pattern.sharesHeldByEmployeeTrusts = value;
            } else if (key.includes('Total') || key.includes('total')) {
              pattern.total = value;
            } else if (key.includes('FII') || key.includes('Foreign')) {
              pattern.foreignInstitutionalInvestors = value;
            } else if (key.includes('DII') || key.includes('Domestic')) {
              pattern.domesticInstitutionalInvestors = value;
            } else {
              pattern.other = (pattern.other || 0) + value;
            }
          });

          return pattern;
        })
        .filter((p: any) => p !== null)
        .sort((a: any, b: any) => {
          // Sort by date descending (most recent first)
          return new Date(b.periodEnded).getTime() - new Date(a.periodEnded).getTime();
        })
        .slice(0, 10); // Last 10 periods
    }

    // Parse borad_meeting (note: typo in API response - "borad" instead of "board") - only keep future dates
    if (data.borad_meeting?.data && Array.isArray(data.borad_meeting.data)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      result.boardMeetings = data.borad_meeting.data
        .filter((item: any) => item.purpose && item.meetingdate)
        .map((item: any) => ({
          subject: item.purpose || '',
          date: parseNSEDate(item.meetingdate),
          purpose: item.purpose || undefined,
          outcome: undefined,
        }))
        .filter((meeting: any) => {
          const meetingDate = new Date(meeting.date);
          meetingDate.setHours(0, 0, 0, 0);
          return meetingDate >= today; // Only keep future dates
        })
        .slice(0, 20);
    }

    // Also check for board_meeting (correct spelling) as fallback - only keep future dates
    if (data.board_meeting?.data && Array.isArray(data.board_meeting.data) && (!result.boardMeetings || result.boardMeetings.length === 0)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      result.boardMeetings = data.board_meeting.data
        .filter((item: any) => item.purpose && item.meetingdate)
        .map((item: any) => ({
          subject: item.purpose || '',
          date: parseNSEDate(item.meetingdate),
          purpose: item.purpose || undefined,
          outcome: undefined,
        }))
        .filter((meeting: any) => {
          const meetingDate = new Date(meeting.date);
          meetingDate.setHours(0, 0, 0, 0);
          return meetingDate >= today; // Only keep future dates
        })
        .slice(0, 20);
    }

  } catch (error: any) {
    console.error(`❌ Error fetching corporate data for ${symbol}:`, error.message);
    if (error.response?.status === 404) {
      console.log(`⚠️ Corporate data not available for ${symbol}`);
    }
    throw error;
  }

  return result;
}

/**
 * Parse NSE date formats
 * Handles: DD-MMM-YYYY, DD-MMM-YYYY HH:mm:ss, DD MMM YYYY, etc.
 */
function parseNSEDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return dateStr;
  }
  
  if (!dateStr) {
    return new Date();
  }

  // Remove time portion if present (e.g., "04-Nov-2025 13:02:01" -> "04-Nov-2025")
  const dateOnly = dateStr.split(' ')[0].trim();

  // Try DD-MMM-YYYY format (e.g., "04-Nov-2025", "30-Sep-2025")
  const ddmmyyyyMatch = dateOnly.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (ddmmyyyyMatch) {
    const months: { [key: string]: number } = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const day = parseInt(ddmmyyyyMatch[1]);
    const month = months[ddmmyyyyMatch[2]] ?? 0;
    const year = parseInt(ddmmyyyyMatch[3]);
    return new Date(year, month, day);
  }

  // Try DD MMM YYYY format (e.g., "30 Sep 2025", "31 Mar 2025")
  const ddmmyyyySpaceMatch = dateOnly.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (ddmmyyyySpaceMatch) {
    const months: { [key: string]: number } = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const day = parseInt(ddmmyyyySpaceMatch[1]);
    const month = months[ddmmyyyySpaceMatch[2]] ?? 0;
    const year = parseInt(ddmmyyyySpaceMatch[3]);
    return new Date(year, month, day);
  }

  // Try DD-MM-YYYY format
  const ddmmyyyyNumericMatch = dateOnly.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyNumericMatch) {
    const day = parseInt(ddmmyyyyNumericMatch[1]);
    const month = parseInt(ddmmyyyyNumericMatch[2]) - 1;
    const year = parseInt(ddmmyyyyNumericMatch[3]);
    return new Date(year, month, day);
  }

  // Try YYYY-MM-DD format
  const yyyymmddMatch = dateOnly.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1]);
    const month = parseInt(yyyymmddMatch[2]) - 1;
    const day = parseInt(yyyymmddMatch[3]);
    return new Date(year, month, day);
  }

  // Fallback to native Date parsing
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Parse number from string, handling commas and other formatting
 */
function parseNumber(value: any): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Remove commas and other non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

