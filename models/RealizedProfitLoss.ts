import mongoose, { Schema, Document } from 'mongoose';

export interface IRealizedProfitLoss extends Document {
  stockName: string;
  sectorName: string;
  isin?: string; // Optional for new format where ISIN might be missing
  closedQty: number;
  sellDate: Date;
  sellPrice: number;
  sellValue: number;
  buyDate: Date;
  buyPrice: number;
  buyValue: number;
  realizedProfitLoss: number;
  clientId: string;
  lastUpdated: Date;
}

const RealizedProfitLossSchema: Schema = new Schema({
  stockName: { type: String, required: true, index: true }, // Add index for stockName lookups
  sectorName: { type: String, required: true },
  isin: { type: String, required: false, index: true, default: '' }, // Make ISIN optional for new format
  closedQty: { type: Number, required: true },
  sellDate: { type: Date, required: true },
  sellPrice: { type: Number, required: true },
  sellValue: { type: Number, required: true },
  buyDate: { type: Date, required: true },
  buyPrice: { type: Number, required: true },
  buyValue: { type: Number, required: true },
  realizedProfitLoss: { type: Number, required: true },
  clientId: { type: String, required: true, index: true },
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.models.RealizedProfitLoss || mongoose.model<IRealizedProfitLoss>('RealizedProfitLoss', RealizedProfitLossSchema);

