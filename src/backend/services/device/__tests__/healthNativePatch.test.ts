import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(
    dirname(require.resolve('react-native-nitro-healthkit/package.json')),
    'android/src/main/kotlin/io/github/n0ku/nitrohealthkit/HealthKitModule.kt',
  ),
  'utf8',
);

// JS mocks cannot detect a native bridge converting failures into successful empty/zero values.
describe('Android health query error patch', () => {
  test('propagates a failed chunk after any quota retries instead of returning partial or empty data', () => {
    const reader = source.slice(
      source.indexOf('private suspend fun <T : Record> readChunkWithRetry'),
      source.indexOf('override fun getQuantityData'),
    );
    expect(reader).toMatch(/ReadRecordsResponse<T> \{/);
    expect(reader).toMatch(
      /if \(!isQuotaError \|\| attempt >= QUOTA_RETRY_MAX_ATTEMPTS\) \{[\s\S]*?throw t/,
    );
    expect(reader).not.toContain('return null');
  });

  test('does not replace a failed native sum with a measured zero', () => {
    const sum = source.slice(
      source.indexOf('if (aggregationType == "sum" && metric != null)'),
      source.indexOf('// Fallback: pull samples'),
    );
    expect(sum).toContain('client.aggregate(');
    expect(sum).toContain(
      'return QuantityMapper.coerceAggregateToDouble(iosType, response[metric])',
    );
    expect(sum).not.toContain('catch');
    expect(sum).not.toContain('else 0.0');
  });
});
