import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ITrackingEntry extends Document {
  predictionId: Types.ObjectId;
  stockSymbol: string;
  date: Date;
  closingPrice: number;
  dailyChange: number;
  totalReturn: number;
  volume: number;
  dayNumber: number;
  expiresAt: Date;
}

const TrackingEntrySchema = new Schema<ITrackingEntry>(
  {
    predictionId: {
      type: Schema.Types.ObjectId,
      ref: 'Prediction',
      required: true,
      index: true,
    },
    stockSymbol: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    closingPrice: { type: Number, required: true },
    dailyChange: { type: Number, required: true },
    totalReturn: { type: Number, required: true },
    volume: { type: Number, required: true },
    dayNumber: { type: Number, required: true },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  {
    timestamps: true,
  }
);

// Compound index to avoid duplicate tracking entries for the same day
TrackingEntrySchema.index({ predictionId: 1, date: 1 }, { unique: true });

const TrackingEntry: Model<ITrackingEntry> =
  mongoose.models.TrackingEntry ||
  mongoose.model<ITrackingEntry>('TrackingEntry', TrackingEntrySchema);

export default TrackingEntry;
