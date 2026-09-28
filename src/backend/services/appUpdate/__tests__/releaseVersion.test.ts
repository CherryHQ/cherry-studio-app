import { compareReleaseVersions } from '../releaseVersion';

test.each([
  ['1.10.0', '1.9.9', 1],
  ['2.0', '1.99.99', 1],
  ['1.2', '1.2.0', 0],
  ['1.2.0.0', '1.2', 0],
  ['0.1.0', '0.1.1', -1],
])('compares release versions %s and %s numerically', (left, right, expected) => {
  expect(compareReleaseVersions(left, right)).toBe(expected);
});

test.each([
  '',
  'unknown',
  'v1.2.3',
  '1.2.3-beta.1',
  '1..2',
  '-1.0',
  '1.2.3.4.5',
  '9007199254740992',
])('rejects an uncomparable version instead of declaring it current: %s', (version) => {
  expect(() => compareReleaseVersions(version, '1.0')).toThrow('Invalid release version');
  expect(() => compareReleaseVersions('1.0', version)).toThrow('Invalid release version');
});
