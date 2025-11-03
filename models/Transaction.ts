import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  stockName: string;
  sectorName: string;
  isin: string;
  transactionDate: Date;
  source: string;
  buySell: string;
  tradedQty: number;
  tradePriceAdjusted: number;
  charges: number;
  tradeValueAdjusted: number;
  clientId: string;
  lastUpdated: Date;
}

const TransactionSchema: Schema = new Schema({
  stockName: { type: String, required: true },
  sectorName: { type: String, required: true },
  isin: { type: String, required: true, index: true },
  transactionDate: { type: Date, required: true },
  source: { type: String, required: true },
  buySell: { type: String, required: true },
  tradedQty: { type: Number, required: true },
  tradePriceAdjusted: { type: Number, required: true },
  charges: { type: Number, required: true },
  tradeValueAdjusted: { type: Number, required: true },
  clientId: { type: String, required: true, index: true },
  lastUpdated: { type: Date, default: Date.now },
});

TransactionSchema.index({ isin: 1, transactionDate: 1, buySell: 1, tradedQty: 1 }, { unique: true });

export default mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

