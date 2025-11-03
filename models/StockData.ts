import mongoose, { Schema, Document } from 'mongoose';

export interface IStockData extends Document {
  isin: string;
  stockName: string;
  symbol?: string;
  exchange?: string;
  date: Date;
  // OHLC & Volume (History data)
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  // Price / Range
  currentPrice?: number; // Current price (same as close for historical data)
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  // Volume metrics
  averageVolume?: number;
  regularMarketVolume?: number;
  // Fundamentals
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  marketCap?: number;
  dividendYield?: number;
  lastUpdated: Date;
}

const StockDataSchema: Schema = new Schema({
  isin: { type: String, required: true, index: true },
  stockName: { type: String, required: true },
  symbol: { type: String },
  exchange: { type: String },
  date: { type: Date, required: true },
  // OHLC & Volume (History data)
  open: { type: Number },
  high: { type: Number },
  low: { type: Number },
  close: { type: Number },
  volume: { type: Number },
  // Price / Range
  currentPrice: { type: Number },
  fiftyTwoWeekHigh: { type: Number },
  fiftyTwoWeekLow: { type: Number },
  // Volume metrics
  averageVolume: { type: Number },
  regularMarketVolume: { type: Number },
  // Fundamentals
  trailingPE: { type: Number },
  forwardPE: { type: Number },
  priceToBook: { type: Number },
  marketCap: { type: Number },
  dividendYield: { type: Number },
  lastUpdated: { type: Date, default: Date.now },
});

StockDataSchema.index({ isin: 1, date: 1 }, { unique: true });

export default mongoose.models.StockData || mongoose.model<IStockData>('StockData', StockDataSchema);

