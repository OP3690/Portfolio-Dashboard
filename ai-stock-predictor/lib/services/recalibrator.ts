import dbConnect from '../mongodb';
import Prediction, { IPrediction, PredictionStatus } from '../models/Prediction';
import ModelWeights, { IWeights, IPerformance } from '../models/ModelWeights';

const DEFAULT_WEIGHTS: IWeights = {
  rsi: 0.15,
  macd: 0.20,
  bbPosition: 0.10,
  volumeRatio: 0.15,
  momentum10d: 0.20,
  maCrossover: 0.10,
  adx: 0.10,
};

const LEARNING_RATE = 0.1;
const BASELINE = 0.5;
const WEIGHT_MIN = 0.05;
const WEIGHT_MAX = 0.40;
const MIN_EVALUATED_PREDICTIONS = 10;

/**
 * Convert prediction status to outcome score
 */
function statusToOutcomeScore(status: PredictionStatus): number {
  switch (status) {
    case 'OverAchieved':
      return 1.0;
    case 'Achieved':
      return 0.8;
    case 'MissedSlightly':
      return 0.3;
    case 'Missed':
    case 'Expired':
      return 0.0;
    default:
      return 0.0;
  }
}

/**
 * Compute the correlation between an indicator score and outcome score
 * Returns the average outcome for predictions where the indicator score was high (>0.6)
 */
function computeIndicatorCorrelation(
  predictions: IPrediction[],
  indicatorKey: keyof IPrediction['indicatorSnapshot']
): number {
  const highScoredPredictions = predictions.filter((p) => {
    const value = p.indicatorSnapshot[indicatorKey];
    // Normalize each indicator value to 0-1 range for comparison
    const normalized = normalizeIndicatorValue(indicatorKey, value);
    return normalized > 0.6;
  });

  if (highScoredPredictions.length === 0) return BASELINE;

  const avgOutcome =
    highScoredPredictions.reduce((sum, p) => sum + statusToOutcomeScore(p.status as PredictionStatus), 0) /
    highScoredPredictions.length;

  return avgOutcome;
}

/**
 * Roughly normalize indicator values for correlation analysis
 */
function normalizeIndicatorValue(
  key: keyof IPrediction['indicatorSnapshot'],
  value: number
): number {
  switch (key) {
    case 'rsi':
      // RSI ideal: 40-65, normalize to 0-1
      if (value >= 45 && value <= 65) return 0.8;
      if (value >= 30 && value < 45) return 0.4;
      if (value > 65 && value <= 75) return 0.5;
      return 0.1;
    case 'macdSignal':
      // Positive signal = bullish
      return value > 0 ? Math.min(value / 2, 1) : 0;
    case 'bbPosition':
      // 0.55-0.75 is ideal
      if (value >= 0.55 && value <= 0.75) return 1.0;
      if (value >= 0.4 && value < 0.55) return 0.6;
      return 0.2;
    case 'volumeRatio':
      return Math.min(value / 2.5, 1);
    case 'momentum10d':
      // Positive momentum up to ~10% is good
      if (value > 0 && value <= 10) return value / 10;
      if (value > 10) return 0.7;
      return 0;
    case 'maCrossover':
      // Slightly above MA is good
      if (value > 0 && value <= 5) return 0.8;
      if (value > 5) return 0.5;
      return 0.2;
    case 'adx':
      return Math.min(value / 50, 1);
    default:
      return 0.5;
  }
}

export interface RecalibrationResult {
  newWeights: IWeights;
  version: string;
  performance: IPerformance;
  message: string;
  weightChanges: Record<string, { old: number; new: number; delta: number }>;
}

/**
 * Adaptive weight recalibration based on historical performance
 */
export async function recalibrateWeights(): Promise<RecalibrationResult> {
  await dbConnect();

  // Load evaluated predictions from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const evaluatedPredictions = await Prediction.find({
    status: { $in: ['Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'] },
    evaluationDate: { $gte: thirtyDaysAgo },
  });

  // Load current active weights
  const activeWeightsDoc = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
  const currentWeights: IWeights = activeWeightsDoc?.weights || DEFAULT_WEIGHTS;
  const currentVersion = activeWeightsDoc?.version || 'v1.0';

  // Compute performance summary
  const totalEvaluated = evaluatedPredictions.length;
  const achievedCount = evaluatedPredictions.filter((p) => p.status === 'Achieved').length;
  const overAchievedCount = evaluatedPredictions.filter((p) => p.status === 'OverAchieved').length;
  const missedSlightlyCount = evaluatedPredictions.filter(
    (p) => p.status === 'MissedSlightly'
  ).length;
  const missedCount = evaluatedPredictions.filter(
    (p) => p.status === 'Missed' || p.status === 'Expired'
  ).length;
  const successRate =
    totalEvaluated > 0 ? ((achievedCount + overAchievedCount) / totalEvaluated) * 100 : 0;
  const avgReturn =
    totalEvaluated > 0
      ? evaluatedPredictions.reduce((sum, p) => sum + (p.finalReturn || 0), 0) / totalEvaluated
      : 0;

  const performance: IPerformance = {
    totalEvaluated,
    achievedCount,
    overAchievedCount,
    missedSlightlyCount,
    missedCount,
    successRate,
    avgReturn,
  };

  // Check minimum predictions requirement
  if (totalEvaluated < MIN_EVALUATED_PREDICTIONS) {
    return {
      newWeights: currentWeights,
      version: currentVersion,
      performance,
      message: `Insufficient data: need ${MIN_EVALUATED_PREDICTIONS} evaluated predictions, have ${totalEvaluated}. Weights unchanged.`,
      weightChanges: {},
    };
  }

  // Compute new weights based on indicator correlations
  const indicatorKeys: Array<keyof IPrediction['indicatorSnapshot']> = [
    'rsi',
    'macdSignal',
    'bbPosition',
    'volumeRatio',
    'momentum10d',
    'maCrossover',
    'adx',
  ];

  const weightKeyMap: Record<string, keyof IWeights> = {
    rsi: 'rsi',
    macdSignal: 'macd',
    bbPosition: 'bbPosition',
    volumeRatio: 'volumeRatio',
    momentum10d: 'momentum10d',
    maCrossover: 'maCrossover',
    adx: 'adx',
  };

  const newWeights = { ...currentWeights };
  const weightChanges: Record<string, { old: number; new: number; delta: number }> = {};

  for (const indicatorKey of indicatorKeys) {
    const avgOutcome = computeIndicatorCorrelation(evaluatedPredictions, indicatorKey);
    const weightKey = weightKeyMap[indicatorKey];
    const oldWeight = currentWeights[weightKey];

    // Adjust weight: new_weight = old_weight + learning_rate * (avg_outcome - baseline)
    let newWeight = oldWeight + LEARNING_RATE * (avgOutcome - BASELINE);

    // Clamp to valid range
    newWeight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, newWeight));

    weightChanges[weightKey] = {
      old: oldWeight,
      new: newWeight,
      delta: newWeight - oldWeight,
    };

    newWeights[weightKey] = newWeight;
  }

  // Normalize so all weights sum to 1.0
  const weightSum = Object.values(newWeights).reduce((a, b) => a + b, 0);
  const normalizedWeights: IWeights = {
    rsi: newWeights.rsi / weightSum,
    macd: newWeights.macd / weightSum,
    bbPosition: newWeights.bbPosition / weightSum,
    volumeRatio: newWeights.volumeRatio / weightSum,
    momentum10d: newWeights.momentum10d / weightSum,
    maCrossover: newWeights.maCrossover / weightSum,
    adx: newWeights.adx / weightSum,
  };

  // Generate new version string
  const versionNumber = parseFloat(currentVersion.replace('v', '')) + 0.1;
  const newVersion = `v${versionNumber.toFixed(1)}`;

  // Deactivate old weights
  if (activeWeightsDoc) {
    activeWeightsDoc.isActive = false;
    await activeWeightsDoc.save();
  }

  // Save new weights
  await ModelWeights.create({
    version: newVersion,
    date: new Date(),
    weights: normalizedWeights,
    performance,
    isActive: true,
  });

  console.log(`Recalibration complete. New model version: ${newVersion}`);

  return {
    newWeights: normalizedWeights,
    version: newVersion,
    performance,
    message: `Successfully recalibrated weights based on ${totalEvaluated} evaluated predictions. New version: ${newVersion}`,
    weightChanges,
  };
}

/**
 * Get current active weights
 */
export async function getActiveWeights(): Promise<IWeights> {
  await dbConnect();
  const active = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
  return active?.weights || DEFAULT_WEIGHTS;
}
