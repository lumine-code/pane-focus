import { movingAverage } from "./signals.js";

export function summarize(samples) {
  if (samples.length === 0) return null;

  const smoothed = movingAverage(samples);
  const total = smoothed.reduce((sum, value) => sum + value, 0);

  return {
    count: samples.length,
    minimum: Math.min(...smoothed),
    maximum: Math.max(...smoothed),
    average: total / samples.length,
  };
}
