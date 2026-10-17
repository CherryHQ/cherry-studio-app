import type { AccelerationSample } from '../../../../modules/diagnostics';

/** Two distinct acceleration peaks within 600 ms distinguish shaking from a single bump. */
export function createShakeDetector() {
  let previousPeak = -Infinity;
  let cooldownUntil = -Infinity;
  let aboveThreshold = false;
  return ({ x, y, z, timestamp }: AccelerationSample): boolean => {
    if (![x, y, z, timestamp].every(Number.isFinite)) return false;
    const magnitude = Math.hypot(x, y, z);
    if (magnitude < 1.5) aboveThreshold = false;
    if (magnitude < 2.5 || aboveThreshold || timestamp < cooldownUntil) return false;
    aboveThreshold = true;
    const elapsed = timestamp - previousPeak;
    previousPeak = timestamp;
    if (elapsed < 100 || elapsed > 600) return false;
    previousPeak = -Infinity;
    cooldownUntil = timestamp + 2000;
    return true;
  };
}
