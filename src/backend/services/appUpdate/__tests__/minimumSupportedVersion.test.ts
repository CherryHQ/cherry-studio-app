import { createMinimumVersionPolicy } from '../minimumSupportedVersion';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));

const key = 'mobile.minSupportedVersion';
const respond = (data: unknown) => mockRequest.mockResolvedValueOnce({ data });

test('compares installed product versions numerically and immediately applies a lowered or withdrawn floor', async () => {
  const signal = new AbortController().signal;
  const policy = createMinimumVersionPolicy('1.9.0', signal);
  expect(policy.getRequiredVersion()).toBeNull();
  for (const [minimum, required] of [
    ['1.10.0', '1.10.0'],
    ['1.9', null],
    ['1.8.5', null],
  ]) {
    respond({ configs: { [key]: minimum } });
    await expect(policy.refreshRequiredVersion(signal)).resolves.toBe(required);
    expect(policy.getRequiredVersion()).toBe(required);
  }
  respond({ configs: { [key]: '2.0' } });
  await policy.refreshRequiredVersion(signal);
  respond({ configs: { unrelated: true } });
  await expect(policy.refreshRequiredVersion(signal)).resolves.toBeNull();
  expect(policy.getRequiredVersion()).toBeNull();
});

test('a failed fetch, malformed response or cancelled refresh preserves the last valid minimum', async () => {
  const lifetime = new AbortController();
  const signal = new AbortController().signal;
  const policy = createMinimumVersionPolicy('1.0', lifetime.signal);
  respond({ configs: { [key]: '2.0' } });
  await policy.refreshRequiredVersion(signal);
  mockRequest.mockRejectedValueOnce(new Error('Offline'));
  await expect(policy.refreshRequiredVersion(signal)).rejects.toThrow();
  for (const invalid of [
    {},
    { configs: [] },
    { configs: { [key]: false } },
    { configs: { [key]: 'v3' } },
  ]) {
    respond(invalid);
    await expect(policy.refreshRequiredVersion(signal)).rejects.toThrow();
    expect(policy.getRequiredVersion()).toBe('2.0');
  }
  mockRequest.mockImplementationOnce(async () => {
    lifetime.abort();
    return { data: { configs: {} } };
  });
  await expect(policy.refreshRequiredVersion(signal)).rejects.toThrow();
  expect(policy.getRequiredVersion()).toBe('2.0');
});
