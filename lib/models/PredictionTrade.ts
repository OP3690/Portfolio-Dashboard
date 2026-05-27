import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ISellLot {
  sellDate:       Date;
  sellPrice:      number;
  sellQuantity:   number;
  realizedPnL:    number;   // (sellPrice - avgBuyPrice) * sellQty
  realizedPnLPct: number;   // realizedPnL / (avgBuyPrice * sellQty) * 100
  notes?:         string;
}

export type TradeStatus = 'holding' | 'partial' | 'closed';

export interface IPredictionTrade extends Document {
  predictionId:          Types.ObjectId;
  stockSymbol:           string;
  stockName:             string;
  predictionEntryPrice:  number;  // AI's recommended entry price

  buyDate:               Date;
  buyPrice:              number;  // average buy price
  buyQuantity:           number;
  totalInvested:         number;  // buyPrice × buyQuantity

  sells:                 ISellLot[];
  soldQuantity:          number;  // total qty sold so far
  remainingQuantity:     number;  // buyQuantity - soldQuantity

  realizedPnL:           number;  // sum of sell lots' realizedPnL
  realizedPnLPct:        number;  // realizedPnL / (buyPrice * soldQty) * 100

  status:                TradeStatus;
  notes?:                string;
}

const SellLotSchema = new Schema<ISellLot>(
  {
    sellDate:       { type: Date,   required: true },
    sellPrice:      { type: Number, required: true },
    sellQuantity:   { type: Number, required: true },
    realizedPnL:    { type: Number, required: true },
    realizedPnLPct: { type: Number, required: true },
    notes:          { type: String },
  },
  { _id: true },
);

const PredictionTradeSchema = new Schema<IPredictionTrade>(
  {
    predictionId:         { type: Schema.Types.ObjectId, ref: 'Prediction', required: true, index: true },
    stockSymbol:          { type: String, required: true, index: true },
    stockName:            { type: String, required: true },
    predictionEntryPrice: { type: Number, required: true },

    buyDate:              { type: Date,   required: true },
    buyPrice:             { type: Number, required: true },
    buyQuantity:          { type: Number, required: true },
    totalInvested:        { type: Number, required: true },

    sells:                { type: [SellLotSchema], default: [] },
    soldQuantity:         { type: Number, default: 0 },
    remainingQuantity:    { type: Number, required: true },

    realizedPnL:          { type: Number, default: 0 },
    realizedPnLPct:       { type: Number, default: 0 },

    status:               {
      type: String,
      enum: ['holding', 'partial', 'closed'],
      default: 'holding',
      index: true,
    },
    notes:                { type: String },
  },
  { timestamps: true },
);

const PredictionTrade: Model<IPredictionTrade> =
  mongoose.models.PredictionTrade ||
  mongoose.model<IPredictionTrade>('PredictionTrade', PredictionTradeSchema);

export default PredictionTrade;
