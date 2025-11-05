import mongoose, { Schema, Document } from 'mongoose';

export interface IStockMaster extends Document {
  isin: string;
  stockName: string;
  symbol?: string;
  exchange?: string;
  sector?: string;
  // Daily update fields (only update if changed)
  industry?: string; // From info.industry
  isFNOSec?: boolean; // From info.isFNOSec
  pdSectorInd?: string; // From metadata.pdSectorInd
  pdSectorPe?: number; // From metadata.pdSectorPe (sector PE)
  pdSymbolPe?: number; // From metadata.pdSymbolPe (stock PE)
  lastUpdated: Date;
}

const StockMasterSchema: Schema = new Schema({
  isin: { type: String, required: true, unique: true, index: true },
  stockName: { type: String, required: true },
  symbol: { type: String },
  exchange: { type: String },
  sector: { type: String },
  // Daily update fields (only update if changed)
  industry: { type: String },
  isFNOSec: { type: Boolean },
  pdSectorInd: { type: String },
  pdSectorPe: { type: Number },
  pdSymbolPe: { type: Number },
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.models.StockMaster || mongoose.model<IStockMaster>('StockMaster', StockMasterSchema);

