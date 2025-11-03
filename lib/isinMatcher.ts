import StockMaster from '@/models/StockMaster';
import { connectDB } from '@/lib/mongodb';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio (0-1) using Levenshtein distance
 */
function similarityRatio(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Normalize stock name for comparison (remove common suffixes, extra spaces, etc.)
 */
function normalizeStockName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove common company suffixes
    .replace(/\b(ltd|limited|corporation|corp|inc|incorporated|pvt|private)\b\.?/gi, '')
    // Remove special characters except spaces
    .replace(/[^\w\s]/g, ' ')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two stock names are similar using multiple strategies
 * Returns the BEST match across all strategies
 */
function areSimilarStockNames(name1: string, name2: string): { 
  similarity: number; 
  method: string;
} {
  const normalized1 = normalizeStockName(name1);
  const normalized2 = normalizeStockName(name2);
  
  let bestMatch: { similarity: number; method: string } = { similarity: 0, method: 'no_match' };
  
  // Strategy 1: Exact match after normalization
  if (normalized1 === normalized2) {
    return { similarity: 1.0, method: 'exact_normalized' };
  }
  
  // Strategy 2: One contains the other (for partial matches)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const shorter = Math.min(normalized1.length, normalized2.length);
    const longer = Math.max(normalized1.length, normalized2.length);
    const containsSimilarity = shorter / longer;
    
    // If search term is contained in DB name, boost similarity
    // e.g., "Ola Electric" in "Ola Electric Mobility Limited" should score higher
    if (normalized2.includes(normalized1)) {
      // Search term is in DB name - this is a strong match
      const containsBoost = Math.min(0.95, containsSimilarity + 0.3);
      bestMatch = { similarity: containsBoost, method: 'contains_boosted' };
    } else {
      bestMatch = { similarity: containsSimilarity, method: 'contains' };
    }
  }
  
  // Strategy 3: Word overlap (check if most words match) - this often scores better
  const words1 = normalized1.split(/\s+/).filter(w => w.length > 2);
  const words2 = normalized2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length > 0 && words2.length > 0) {
    const matchingWords = words1.filter(w1 => 
      words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))
    );
    const wordSimilarity = (matchingWords.length * 2) / (words1.length + words2.length);
    
    if (wordSimilarity > bestMatch.similarity) {
      bestMatch = { similarity: wordSimilarity, method: 'word_overlap' };
    }
  }
  
  // Strategy 4: Levenshtein similarity
  const levenshteinSim = similarityRatio(normalized1, normalized2);
  if (levenshteinSim > bestMatch.similarity) {
    bestMatch = { similarity: levenshteinSim, method: 'levenshtein' };
  }
  
  // Strategy 5: Initial characters match (for abbreviations)
  const initials1 = normalized1.split(/\s+/).map(w => w[0]).join('');
  const initials2 = normalized2.split(/\s+/).map(w => w[0]).join('');
  if (initials1 === initials2 && initials1.length >= 3 && 0.8 > bestMatch.similarity) {
    bestMatch = { similarity: 0.8, method: 'initials' };
  }
  
  return bestMatch;
}

/**
 * Find ISIN for a stock name using fuzzy matching from StockMaster collection
 * Returns the best match if similarity is above threshold (default 0.7)
 */
export async function findISINByStockName(
  stockName: string, 
  threshold: number = 0.7
): Promise<{ isin: string; stockName: string; similarity: number; method: string } | null> {
  try {
    await connectDB();
    
    if (!stockName || !stockName.trim()) {
      return null;
    }
    
    // Get all stocks from StockMaster (cache this in production)
    const allStocks = await StockMaster.find({}).lean();
    
    if (allStocks.length === 0) {
      console.warn(`⚠️  StockMaster collection is empty. Please upload NSE_BSE_Active_Scripts_with_ISIN.xlsx first.`);
      return null;
    }
    
    // Find best match
    let bestMatch: {
      isin: string;
      stockName: string;
      similarity: number;
      method: string;
    } | null = null;
    
    for (const stock of allStocks) {
      const dbStockName = String(stock.stockName || '').trim();
      if (!dbStockName || !stock.isin) continue;
      
      const match = areSimilarStockNames(stockName, dbStockName);
      
      if (match.similarity >= threshold) {
        if (!bestMatch || match.similarity > bestMatch.similarity) {
          bestMatch = {
            isin: stock.isin,
            stockName: dbStockName,
            similarity: match.similarity,
            method: match.method,
          };
        }
      }
    }
    
    if (bestMatch) {
      console.log(`✅ Found ISIN for "${stockName}": ${bestMatch.isin} (${bestMatch.stockName}) - Similarity: ${(bestMatch.similarity * 100).toFixed(1)}% (${bestMatch.method})`);
    } else {
      console.warn(`⚠️  No ISIN found for "${stockName}" (threshold: ${threshold * 100}%)`);
      // Try with lower threshold for debugging
      const lowerThresholdMatch = await findISINByStockName(stockName, 0.5);
      if (lowerThresholdMatch) {
        console.warn(`   (Lower threshold 50% match: ${lowerThresholdMatch.isin} - ${lowerThresholdMatch.stockName} - ${(lowerThresholdMatch.similarity * 100).toFixed(1)}%)`);
      }
    }
    
    return bestMatch;
  } catch (error: any) {
    console.error(`Error finding ISIN for "${stockName}":`, error);
    return null;
  }
}

/**
 * Batch find ISINs for multiple stock names
 * Returns a Map of stockName -> { isin, similarity, method }
 */
export async function findISINsForStockNames(
  stockNames: string[],
  threshold: number = 0.7
): Promise<Map<string, { isin: string; similarity: number; method: string }>> {
  const result = new Map<string, { isin: string; similarity: number; method: string }>();
  
  // Use Set to deduplicate stock names
  const uniqueNames = [...new Set(stockNames.map(n => n.trim()).filter(Boolean))];
  
  for (const stockName of uniqueNames) {
    const match = await findISINByStockName(stockName, threshold);
    if (match) {
      result.set(stockName.toLowerCase(), {
        isin: match.isin,
        similarity: match.similarity,
        method: match.method,
      });
    }
  }
  
  return result;
}

