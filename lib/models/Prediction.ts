import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IIndicatorSnapshot {
  rsi: number;
  macdSignal: number;
  bbPosition: number;
  volumeRatio: number;
  momentum10d: number;
  maCrossover: number;
  adx: number;
}

export type PredictionStatus =
  | 'Active'
  | 'Achieved'
  | 'OverAchieved'
  | 'MissedSlightly'
  | 'Missed'
  | 'Expired';

export interface IPrediction extends Document {
  stockSymbol: string;
  stockName: string;
  exchange: string;
  firstRecommendedDate: Date;
  latestRecommendedDate: Date;
  recommendationDates: Date[];
  recommendationCount: number;
  entryPrice: number;
  targetReturn: number;
  confidenceScore: number;
  status: PredictionStatus;
  bestReturn: number;
  finalReturn?: number;
  evaluationDate?: Date;
  modelVersion: string;
  indicatorSnapshot: IIndicatorSnapshot;
  expiresAt: Date;
}

const IndicatorSnapshotSchema = new Schema<IIndicatorSnapshot>(
  {
    rsi: { type: Number, required: true },
    macdSignal: { type: Number, required: true },
    bbPosition: { type: Number, required: true },
    volumeRatio: { type: Number, required: true },
    momentum10d: { type: Number, required: true },
    maCrossover: { type: Number, required: true },
    adx: { type: Number, required: true },
  },
  { _id: false }
);

const PredictionSchema = new Schema<IPrediction>(
  {
    stockSymbol: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    exchange: { type: String, required: true, default: 'NSE' },
    firstRecommendedDate: { type: Date, required: true },
    latestRecommendedDate: { type: Date, required: true },
    recommendationDates: [{ type: Date }],
    recommendationCount: { type: Number, default: 1 },
    entryPrice: { type: Number, required: true },
    targetReturn: { type: Number, default: 5 },
    confidenceScore: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Active', 'Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'],
      default: 'Active',
      index: true,
    },
    bestReturn: { type: Number, default: 0 },
    finalReturn: { type: Number },
    evaluationDate: { type: Date },
    modelVersion: { type: String, required: true },
    indicatorSnapshot: { type: IndicatorSnapshotSchema, required: true },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  {
    timestamps: true,
  }
);

const Prediction: Model<IPrediction> =
  mongoose.models.Prediction || mongoose.model<IPrediction>('Prediction', PredictionSchema);

export default Prediction;
