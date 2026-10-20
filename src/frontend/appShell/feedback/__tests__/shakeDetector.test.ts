import { createShakeDetector } from '../shakeDetector';

const sample = (x: number, timestamp: number) => ({ x, y: 0, z: 1, timestamp });

test('ignores gravity, ordinary movement, one bump and sustained acceleration', () => {
  const detect = createShakeDetector();
  for (let timestamp = 0; timestamp <= 1000; timestamp += 50)
    expect(detect(sample(timestamp >= 500 ? 3 : 0.5, timestamp))).toBe(false);
});

test('requires separate peaks close in time and applies a cooldown', () => {
  const detect = createShakeDetector();
  expect(detect(sample(3, 0))).toBe(false);
  expect(detect(sample(0, 50))).toBe(false);
  expect(detect(sample(-3, 200))).toBe(true);
  detect(sample(0, 250));
  expect(detect(sample(3, 400))).toBe(false);
  detect(sample(0, 450));
  expect(detect(sample(-3, 600))).toBe(false);
  detect(sample(0, 2200));
  expect(detect(sample(3, 2300))).toBe(false);
  detect(sample(0, 2350));
  expect(detect(sample(-3, 2500))).toBe(true);
});

test('does not combine isolated bumps or invalid sensor samples', () => {
  const detect = createShakeDetector();
  expect(detect(sample(3, 0))).toBe(false);
  detect(sample(0, 50));
  expect(detect(sample(3, 1000))).toBe(false);
  expect(detect(sample(NaN, 1100))).toBe(false);
});
