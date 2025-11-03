import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Load environment variables
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (e) {
  console.warn('Could not load .env.local');
}

// Import the fuzzy matching function
const isinMatcherPath = path.join(process.cwd(), 'lib', 'isinMatcher.ts');
console.log('Testing fuzzy matching for "Ola Electric"...\n');

// Simple test of the matching logic
function normalizeStockName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(ltd|limited|corporation|corp|inc|incorporated|pvt|private)\b\.?/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

function similarityRatio(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

const searchName = 'Ola Electric';
const dbName = 'Ola Electric Mobility Limited';

console.log(`Searching for: "${searchName}"`);
console.log(`Database name: "${dbName}"\n`);

const normalized1 = normalizeStockName(searchName);
const normalized2 = normalizeStockName(dbName);

console.log(`Normalized search: "${normalized1}"`);
console.log(`Normalized DB: "${normalized2}"\n`);

// Test contains
const contains = normalized1.includes(normalized2) || normalized2.includes(normalized1);
console.log(`Contains match: ${contains}`);

// Test Levenshtein
const similarity = similarityRatio(normalized1, normalized2);
console.log(`Levenshtein similarity: ${(similarity * 100).toFixed(1)}%`);

// Test word overlap
const words1 = normalized1.split(/\s+/).filter(w => w.length > 2);
const words2 = normalized2.split(/\s+/).filter(w => w.length > 2);
console.log(`Words 1: [${words1.join(', ')}]`);
console.log(`Words 2: [${words2.join(', ')}]`);

const matchingWords = words1.filter(w1 => 
  words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))
);
console.log(`Matching words: [${matchingWords.join(', ')}]`);

const wordSimilarity = (matchingWords.length * 2) / (words1.length + words2.length);
console.log(`Word similarity: ${(wordSimilarity * 100).toFixed(1)}%\n`);

if (similarity >= 0.7 || wordSimilarity >= 0.6 || contains) {
  console.log(`✅ MATCH FOUND! Similarity: ${Math.max(similarity, wordSimilarity, contains ? 0.8 : 0)}`);
} else {
  console.log(`❌ No match (threshold: 70%)`);
}

