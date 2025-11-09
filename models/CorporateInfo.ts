import mongoose, { Schema, Document } from 'mongoose';

export interface ICorporateInfo extends Document {
  isin: string;
  symbol?: string;
  stockName?: string;
  
  // Announcements
  announcements?: Array<{
    subject: string;
    date: Date;
    description?: string;
  }>;
  
  // Corporate Actions
  corporateActions?: Array<{
    subject: string;
    date: Date;
    exDate?: Date;
    recordDate?: Date;
    description?: string;
    actionType?: string; // e.g., "Dividend", "Bonus", "Split", "Rights"
  }>;
  
  // Board Meetings
  boardMeetings?: Array<{
    subject: string;
    date: Date;
    purpose?: string;
    outcome?: string;
  }>;
  
  // Financial Results (Amount in Lakhs)
  financialResults?: Array<{
    quarterEnded: Date;
    totalIncome: number; // in Lakhs
    netProfitLoss: number; // in Lakhs
    earningsPerShare: number;
    revenue?: number;
    operatingProfit?: number;
    netProfitMargin?: number;
  }>;
  
  // Shareholding Patterns (in %)
  shareholdingPatterns?: Array<{
    periodEnded: Date;
    promoterAndPromoterGroup: number; // %
    public: number; // %
    sharesHeldByEmployeeTrusts?: number; // %
    foreignInstitutionalInvestors?: number; // %
    domesticInstitutionalInvestors?: number; // %
    other?: number; // %
    total: number; // % (should be 100)
  }>;
  
  lastUpdated: Date;
}

const CorporateInfoSchema: Schema = new Schema({
  isin: { type: String, required: true },
  symbol: { type: String },
  stockName: { type: String },
  
  announcements: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    description: { type: String },
  }],
  
  corporateActions: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    exDate: { type: Date },
    recordDate: { type: Date },
    description: { type: String },
    actionType: { type: String },
  }],
  
  boardMeetings: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    purpose: { type: String },
    outcome: { type: String },
  }],
  
  financialResults: [{
    quarterEnded: { type: Date, required: true },
    totalIncome: { type: Number },
    netProfitLoss: { type: Number },
    earningsPerShare: { type: Number },
    revenue: { type: Number },
    operatingProfit: { type: Number },
    netProfitMargin: { type: Number },
  }],
  
  shareholdingPatterns: [{
    periodEnded: { type: Date, required: true },
    promoterAndPromoterGroup: { type: Number },
    public: { type: Number },
    sharesHeldByEmployeeTrusts: { type: Number },
    foreignInstitutionalInvestors: { type: Number },
    domesticInstitutionalInvestors: { type: Number },
    other: { type: Number },
    total: { type: Number },
  }],
  
  lastUpdated: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

CorporateInfoSchema.index({ isin: 1 }, { unique: true });
CorporateInfoSchema.index({ symbol: 1 });

export default mongoose.models.CorporateInfo || mongoose.model<ICorporateInfo>('CorporateInfo', CorporateInfoSchema);

