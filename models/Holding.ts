import mongoose, { Schema, Document } from 'mongoose';

export interface IHolding extends Document {
  stockName: string;
  sectorName: string;
  isin: string;
  portfolioPercentage: number;
  openQty: number;
  marketPrice: number;
  marketValue: number;
  investmentAmount: number;
  avgCost: number;
  profitLossTillDate: number;
  profitLossTillDatePercent: number;
  lastUpdated: Date;
  clientId: string;
  clientName: string;
  asOnDate: Date;
}

const HoldingSchema: Schema = new Schema({
  stockName: { type: String, required: true },
  sectorName: { type: String, required: true },
  isin: { type: String, required: true, index: true },
  portfolioPercentage: { type: Number, required: true },
  openQty: { type: Number, required: true },
  marketPrice: { type: Number, required: true },
  marketValue: { type: Number, required: true },
  investmentAmount: { type: Number, required: true },
  avgCost: { type: Number, required: true },
  profitLossTillDate: { type: Number, required: true },
  profitLossTillDatePercent: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now },
  clientId: { type: String, required: true, index: true },
  clientName: { type: String, required: true },
  asOnDate: { type: Date, required: true },
});

// Create compound unique index on (clientId, isin) to prevent duplicates
// This ensures one holding per client per ISIN
HoldingSchema.index({ clientId: 1, isin: 1 }, { unique: true });

export default mongoose.models.Holding || mongoose.model<IHolding>('Holding', HoldingSchema);

