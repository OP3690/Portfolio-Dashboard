import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWeights {
  rsi: number;
  macd: number;
  bbPosition: number;
  volumeRatio: number;
  momentum10d: number;
  maCrossover: number;
  adx: number;
}

export interface IPerformance {
  totalEvaluated: number;
  achievedCount: number;
  overAchievedCount: number;
  missedSlightlyCount: number;
  missedCount: number;
  successRate: number;
  avgReturn: number;
}

export interface IModelWeights extends Document {
  version: string;
  date: Date;
  weights: IWeights;
  performance: IPerformance;
  isActive: boolean;
}

const WeightsSchema = new Schema<IWeights>(
  {
    rsi: { type: Number, required: true },
    macd: { type: Number, required: true },
    bbPosition: { type: Number, required: true },
    volumeRatio: { type: Number, required: true },
    momentum10d: { type: Number, required: true },
    maCrossover: { type: Number, required: true },
    adx: { type: Number, required: true },
  },
  { _id: false }
);

const PerformanceSchema = new Schema<IPerformance>(
  {
    totalEvaluated: { type: Number, default: 0 },
    achievedCount: { type: Number, default: 0 },
    overAchievedCount: { type: Number, default: 0 },
    missedSlightlyCount: { type: Number, default: 0 },
    missedCount: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    avgReturn: { type: Number, default: 0 },
  },
  { _id: false }
);

const ModelWeightsSchema = new Schema<IModelWeights>(
  {
    version: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    weights: { type: WeightsSchema, required: true },
    performance: { type: PerformanceSchema, required: true },
    isActive: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

const ModelWeights: Model<IModelWeights> =
  mongoose.models.ModelWeights ||
  mongoose.model<IModelWeights>('ModelWeights', ModelWeightsSchema);

export default ModelWeights;
