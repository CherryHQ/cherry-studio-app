import type { Tool } from 'ai';
import * as Location from 'expo-location';

import { createHealthToolEntries } from '../healthTools';
import { createLocationToolEntry } from '../locationTools';

const healthKit = {
  getAggregatedQuantity: jest.fn(async () => 100),
  getCategoryData: jest.fn(async () => []),
  getQuantityData: jest.fn(async () => []),
  getWorkouts: jest.fn(async () => []),
};

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

describe('location and health adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: {
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 31.2304,
        longitude: 121.4737,
        speed: null,
      },
      timestamp: Date.parse('2026-07-29T10:00:00Z'),
    } as never);
    jest
      .mocked(Location.reverseGeocodeAsync)
      .mockResolvedValue([{ city: 'Shanghai', country: 'China' }] as never);
  });

  test('returns serializable current location and controls reverse geocoding', async () => {
    const location = createLocationToolEntry(deps()).tool;
    const output = await execute(location, { includeAddress: true });
    expect(output).toEqual(
      expect.objectContaining({
        address: expect.objectContaining({ city: 'Shanghai' }),
        coords: expect.objectContaining({ latitude: 31.2304 }),
      }),
    );
    await execute(location, { includeAddress: false });
    expect(Location.reverseGeocodeAsync).toHaveBeenCalledTimes(1);
  });

  test('normalizes health metric and date sentinels', async () => {
    const summary = healthTool('health_get_summary');
    const output = (await execute(summary, {
      endDate: '2026-07-30T00:00:00Z',
      granularity: 'summary',
      metrics: ['steps'],
      startDate: '2026-07-29T00:00:00Z',
    })) as { data: Record<string, { value: number }> };
    expect(output.data).toEqual({ steps: { unit: 'count', value: 100 } });
    expect(healthKit.getAggregatedQuantity).toHaveBeenCalledTimes(1);
  });

  test('uses the workout limit default when limit is zero', async () => {
    healthKit.getWorkouts.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        duration: 10,
        endDate: new Date(1000 + index),
        startDate: new Date(index),
        workoutActivityName: 'Run',
        workoutActivityType: 37,
      })) as never,
    );
    const output = (await execute(healthTool('health_list_workouts'), {
      endDate: '2026-07-30T00:00:00Z',
      limit: 0,
      startDate: '2026-07-29T00:00:00Z',
    })) as unknown[];
    expect(output).toHaveLength(20);
  });
});

function deps() {
  return {
    devicePermission: { getStatusForPreference: jest.fn(async () => 'granted') },
    preference: { get: jest.fn(async () => 'always') },
  } as never;
}

function healthTool(name: string): Tool {
  const selected = createHealthToolEntries(deps(), async () => healthKit as never).find(
    (entry) => entry.name === name,
  )?.tool;
  if (!selected) throw new Error(`Missing tool: ${name}`);
  return selected;
}

function execute(selected: Tool, input: unknown) {
  if (!selected.execute) throw new Error('Tool is not executable');
  return selected.execute(input, {
    experimental_context: { requestId: 'request-1' },
    messages: [],
    toolCallId: 'call-1',
  });
}
