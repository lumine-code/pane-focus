export function movingAverage(samples, windowSize = 3) {
  if (windowSize < 1) {
    throw new RangeError("Window size must be positive.");
  }

  const smoothed = [];
  let total = 0;

  for (let index = 0; index < samples.length; index++) {
    total += samples[index];

    if (index >= windowSize) {
      total -= samples[index - windowSize];
    }

    const count = Math.min(index + 1, windowSize);
    smoothed.push(total / count);
  }

  return smoothed;
}

export function normalize(samples) {
  const peak = Math.max(...samples.map(Math.abs), 0);
  return peak === 0 ? samples.map(() => 0) : samples.map((sample) => sample / peak);
}
