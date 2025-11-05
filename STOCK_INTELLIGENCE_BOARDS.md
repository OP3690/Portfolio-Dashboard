# Stock Intelligence Boards

## Overview

This feature provides three comprehensive intelligence boards to track:

1. **Financial Results Calendar** - Stocks with upcoming quarterly results
2. **Promoter Holding Increasing** - Stocks where promoter holding is increasing
3. **Promoter Holding Decreasing** - Stocks where promoter holding is decreasing

## API Endpoints

### 1. Financial Results Calendar

**Endpoint:** `GET /api/financial-results-calendar?days=7|15|30|60`

**Description:** Returns stocks with upcoming financial results in the next N days.

**Parameters:**
- `days` (required): 7, 15, 30, or 60

**Response:**
```json
{
  "success": true,
  "days": 30,
  "count": 25,
  "results": [
    {
      "isin": "INE467B01029",
      "symbol": "TCS",
      "stockName": "Tata Consultancy Services Limited",
      "lastQuarterEnded": "2024-12-31T00:00:00.000Z",
      "expectedDate": "2025-02-15T00:00:00.000Z",
      "daysUntil": 12,
      "lastTotalIncome": 1664300,
      "lastNetProfit": 100600,
      "lastEPS": 11.34,
      "currentPrice": 2987.7
    }
  ]
}
```

**Logic:**
- Estimates next result date based on last quarter end (typically 45-60 days after quarter end)
- Filters results within the specified time window
- Sorts by days until (soonest first)

### 2. Promoter Holding Changes

**Endpoint:** `GET /api/promoter-holding-changes?type=increasing|decreasing&days=7|15|30`

**Description:** Returns stocks where promoter holding is increasing or decreasing in the last N days.

**Parameters:**
- `type` (required): "increasing" or "decreasing"
- `days` (required): 7, 15, or 30

**Response:**
```json
{
  "success": true,
  "type": "increasing",
  "days": 30,
  "count": 15,
  "changes": [
    {
      "isin": "INE467B01029",
      "symbol": "TCS",
      "stockName": "Tata Consultancy Services Limited",
      "currentHolding": 52.90,
      "previousHolding": 52.50,
      "change": 0.40,
      "changePercent": 0.76,
      "currentDate": "2024-09-30T00:00:00.000Z",
      "previousDate": "2024-06-30T00:00:00.000Z",
      "daysAgo": 35,
      "currentPrice": 2987.7
    }
  ]
}
```

**Logic:**
- Compares most recent shareholding pattern with previous period
- Filters based on type (increasing/decreasing)
- Sorts by absolute change percent (largest changes first)

## Frontend Component

**Component:** `StockIntelligenceBoards.tsx`

**Location:** `components/StockIntelligenceBoards.tsx`

**Features:**
- Tabbed interface for three board types
- Time period filters (7, 15, 30, 60 days)
- Color-coded tables with sorting
- Real-time data fetching
- Responsive design

**Integration:**
The component is integrated into the Stock Research page (`components/StockResearch.tsx`) and appears at the bottom of the page.

## Data Requirements

### CorporateInfo Collection

The boards rely on data stored in the `CorporateInfo` collection:

1. **Financial Results:**
   - `financialResults[]` array with `quarterEnded`, `totalIncome`, `netProfitLoss`, `earningsPerShare`

2. **Shareholding Patterns:**
   - `shareholdingPatterns[]` array with `periodEnded`, `promoterAndPromoterGroup`, `public`, etc.

### Data Population

To populate corporate data:

1. **Automatic:** The `/api/corporate-data` endpoint fetches and stores data when a stock is viewed in Detailed Stock Analysis
2. **Manual:** Use the `fetchNSECorporateData()` function from `lib/nseCorporateDataService.ts`
3. **Bulk:** Create a script to fetch corporate data for all stocks (see below)

## Usage

### Viewing the Boards

1. Navigate to **Stock Research** page
2. Scroll down to **Stock Intelligence Boards** section
3. Select a tab:
   - **Financial Results Calendar** - See upcoming results
   - **Promoter Holding Increasing** - Track increasing promoter confidence
   - **Promoter Holding Decreasing** - Monitor decreasing promoter confidence

### Time Periods

- **Financial Results:** 7, 15, 30, 60 days
- **Promoter Holdings:** 7, 15, 30 days

## Future Enhancements

1. **Email Alerts:** Notify users when results are announced or holdings change significantly
2. **Historical Trends:** Show charts of promoter holding changes over time
3. **Sector Analysis:** Group stocks by sector for comparative analysis
4. **Export:** Download data as CSV/Excel
5. **Filters:** Add filters by sector, market cap, etc.
6. **Real-time Updates:** WebSocket updates for live data changes

## Notes

- Financial result dates are **estimated** based on typical announcement patterns (45-60 days after quarter end)
- Shareholding pattern data depends on periodic filings (quarterly)
- Data freshness depends on when corporate data was last fetched from NSE
- The system caches corporate data for 7 days to reduce API calls

