import mongoose, { Schema, Document } from 'mongoose';

export interface IStockMaster extends Document {
  isin: string;
  stockName: string;
  symbol?: string;
  exchange?: string;
  sector?: string;
  lastUpdated: Date;
}

const StockMasterSchema: Schema = new Schema({
  isin: { type: String, required: true, unique: true, index: true },
  stockName: { type: String, required: true },
  symbol: { type: String },
  exchange: { type: String },
  sector: { type: String },
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.models.StockMaster || mongoose.model<IStockMaster>('StockMaster', StockMasterSchema);

