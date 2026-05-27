import dbConnect from '../mongodb';
import Prediction, { IPrediction, PredictionStatus } from '../models/Prediction';
import ModelWeights, { IWeights, IPerformance } from '../models/ModelWeights';

const DEFAULT_WEIGHTS: IWeights = {
  rsi: 0.15, macd: 0.20, bbPosition: 0.10,
  volumeRatio: 0.15, momentum10d: 0.20, maCrossover: 0.10, adx: 0.10,
};

const LEARNING_RATE = 0.1;
const BASELINE      = 0.5;
const WEIGHT_MIN    = 0.05;
const WEIGHT_MAX    = 0.40;
const MIN_EVALUATED = 10;

function statusToScore(status: PredictionStatus): number {
  switch (status) {
    case 'OverAchieved':   return 1.0;
    case 'Achieved':       return 0.8;
    case 'MissedSlightly': return 0.3;
    default:               return 0.0;
  }
}

function normalizeIndicatorValue(key: keyof IPrediction['indicatorSnapshot'], value: number): number {
  switch (key) {
    case 'rsi':
      if (value >= 45 && value <= 65) return 0.8;
      if (value >= 30 && value < 45)  return 0.4;
      if (value > 65 && value <= 75)  return 0.5;
      return 0.1;
    case 'macdSignal':
      return value > 0 ? Math.min(value / 2, 1) : 0;
    case 'bbPosition':
      if (value >= 0.55 && value <= 0.75) return 1.0;
      if (value >= 0.4  && value < 0.55)  return 0.6;
      return 0.2;
    case 'volumeRatio':
      return Math.min(value / 2.5, 1);
    case 'momentum10d':
      if (value > 0 && value <= 10) return value / 10;
      if (value > 10) return 0.7;
      return 0;
    case 'maCrossover':
      if (value > 0 && value <= 5) return 0.8;
      if (value > 5) return 0.5;
      return 0.2;
    case 'adx':
      return Math.min(value / 50, 1);
    default:
      return 0.5;
  }
}

function computeCorrelation(
  predictions: IPrediction[],
  key: keyof IPrediction['indicatorSnapshot']
): number {
  const high = predictions.filter((p) => normalizeIndicatorValue(key, p.indicatorSnapshot[key]) > 0.6);
  if (high.length === 0) return BASELINE;
  return high.reduce((s, p) => s + statusToScore(p.status as PredictionStatus), 0) / high.length;
}

export interface RecalibrationResult {
  newWeights: IWeights;
  version: string;
  performance: IPerformance;
  message: string;
  weightChanges: Record<string, { old: number; new: number; delta: number }>;
}

export async function recalibrateWeights(): Promise<RecalibrationResult> {
  await dbConnect();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const evaluated = await Prediction.find({
    status:         { $in: ['Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'] },
    evaluationDate: { $gte: thirtyDaysAgo },
  });

  const activeDoc       = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
  const currentWeights  = activeDoc?.weights ?? DEFAULT_WEIGHTS;
  const currentVersion  = activeDoc?.version ?? 'v1.0';

  const totalEvaluated       = evaluated.length;
  const achievedCount        = evaluated.filter((p) => p.status === 'Achieved').length;
  const overAchievedCount    = evaluated.filter((p) => p.status === 'OverAchieved').length;
  const missedSlightlyCount  = evaluated.filter((p) => p.status === 'MissedSlightly').length;
  const missedCount          = evaluated.filter((p) => p.status === 'Missed' || p.status === 'Expired').length;
  const successRate          = totalEvaluated > 0 ? ((achievedCount + overAchievedCount) / totalEvaluated) * 100 : 0;
  const avgReturn            = totalEvaluated > 0 ? evaluated.reduce((s, p) => s + (p.finalReturn || 0), 0) / totalEvaluated : 0;

  const performance: IPerformance = {
    totalEvaluated, achievedCount, overAchievedCount, missedSlightlyCount, missedCount, successRate, avgReturn,
  };

  if (totalEvaluated < MIN_EVALUATED) {
    return {
      newWeights: currentWeights, version: currentVersion, performance,
      message: `Insufficient data: need ${MIN_EVALUATED}, have ${totalEvaluated}. Weights unchanged.`,
      weightChanges: {},
    };
  }

  const indicatorKeys: Array<keyof IPrediction['indicatorSnapshot']> = [
    'rsi', 'macdSignal', 'bbPosition', 'volumeRatio', 'momentum10d', 'maCrossover', 'adx',
  ];
  const keyMap: Record<string, keyof IWeights> = {
    rsi: 'rsi', macdSignal: 'macd', bbPosition: 'bbPosition',
    volumeRatio: 'volumeRatio', momentum10d: 'momentum10d', maCrossover: 'maCrossover', adx: 'adx',
  };

  const newWeights = { ...currentWeights };
  const weightChanges: Record<string, { old: number; new: number; delta: number }> = {};

  for (const iKey of indicatorKeys) {
    const avgOutcome = computeCorrelation(evaluated, iKey);
    const wKey       = keyMap[iKey];
    const oldW       = currentWeights[wKey];
    const newW       = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, oldW + LEARNING_RATE * (avgOutcome - BASELINE)));
    weightChanges[wKey] = { old: oldW, new: newW, delta: newW - oldW };
    newWeights[wKey]    = newW;
  }

  const weightSum        = Object.values(newWeights).reduce((a, b) => a + b, 0);
  const normalizedWeights: IWeights = {
    rsi:         newWeights.rsi         / weightSum,
    macd:        newWeights.macd        / weightSum,
    bbPosition:  newWeights.bbPosition  / weightSum,
    volumeRatio: newWeights.volumeRatio / weightSum,
    momentum10d: newWeights.momentum10d / weightSum,
    maCrossover: newWeights.maCrossover / weightSum,
    adx:         newWeights.adx         / weightSum,
  };

  const vNum       = parseFloat(currentVersion.replace('v', '')) + 0.1;
  const newVersion = `v${vNum.toFixed(1)}`;

  if (activeDoc) { activeDoc.isActive = false; await activeDoc.save(); }

  await ModelWeights.create({
    version: newVersion, date: new Date(), weights: normalizedWeights, performance, isActive: true,
  });

  return {
    newWeights: normalizedWeights, version: newVersion, performance,
    message: `Recalibrated on ${totalEvaluated} predictions. New version: ${newVersion}`,
    weightChanges,
  };
}

export async function getActiveWeights(): Promise<IWeights> {
  await dbConnect();
  const active = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
  return active?.weights ?? DEFAULT_WEIGHTS;
}
