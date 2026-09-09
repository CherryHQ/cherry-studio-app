import { getCurrentLocation } from '@/backend/services/device';

import { createLocationTools } from '../locationTools';

jest.mock('@/backend/services/device', () => ({ getCurrentLocation: jest.fn() }));

function execute(signal = new AbortController().signal) {
  const [tool] = createLocationTools({
    devicePermissions: {
      getStatuses: jest.fn(async () => ({
        'location.read': { state: 'granted' as const, canAskAgain: false },
      })),
      request: jest.fn(),
    },
  });
  return tool!.execute({
    input: { includeAddress: false },
    signal,
    toolCallId: 'location-1',
  });
}

beforeEach(() => jest.clearAllMocks());

test.each(['E_LOCATION_TIMEOUT', 'E_LOCATION_SERVICES_DISABLED', 'E_LOCATION_PERMISSION_DENIED'])(
  'reports %s as a position failure without instructing a blind retry',
  async (code) => {
    jest
      .mocked(getCurrentLocation)
      .mockRejectedValue(Object.assign(new Error('Native reason'), { code }));
    const result = await execute();
    expect(result.value).toMatchObject({
      status: 'error',
      stage: 'position',
      code,
      retryable: false,
      message: expect.stringContaining('Native reason'),
    });
    expect(result.value).toMatchObject({ message: expect.not.stringContaining('Retry once') });
  },
);

test('turn cancellation reaches the location operation and propagates out of the tool', async () => {
  const controller = new AbortController();
  jest.mocked(getCurrentLocation).mockImplementation(async (_input, signal) => {
    expect(signal).toBe(controller.signal);
    controller.abort();
    throw controller.signal.reason;
  });
  await expect(execute(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

test('native cancellation propagates instead of becoming a retryable tool failure', async () => {
  jest
    .mocked(getCurrentLocation)
    .mockRejectedValue(Object.assign(new Error('Cancelled'), { code: 'E_LOCATION_CANCELLED' }));
  await expect(execute()).rejects.toMatchObject({ name: 'AbortError' });
});
