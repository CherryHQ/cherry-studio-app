import type { Tool, ToolSet } from 'ai';
import * as Location from 'expo-location';

import { createLocationTools } from '../locationTools';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

describe('location tools', () => {
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
      timestamp: Date.parse('2026-07-28T10:00:00Z'),
    } as never);
    jest
      .mocked(Location.reverseGeocodeAsync)
      .mockResolvedValue([{ city: 'Shanghai', country: 'China' }] as never);
  });

  test('returns current coordinates and a serializable address', async () => {
    const result = await executeTool(createLocationTools(), 'builtin_get_current_location', {
      includeAddress: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        address: expect.objectContaining({ city: 'Shanghai', country: 'China' }),
        coords: expect.objectContaining({ latitude: 31.2304, longitude: 121.4737 }),
        timestamp: '2026-07-28T10:00:00.000Z',
      }),
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test('keeps coordinates when reverse geocoding fails', async () => {
    jest.mocked(Location.reverseGeocodeAsync).mockRejectedValue(new Error('offline'));

    const result = (await executeTool(createLocationTools(), 'builtin_get_current_location', {
      includeAddress: true,
    })) as { address: unknown; coords: { latitude: number } };

    expect(result.address).toBeNull();
    expect(result.coords.latitude).toBe(31.2304);
  });

  test('skips reverse geocoding when the caller only needs coordinates', async () => {
    await executeTool(createLocationTools(), 'builtin_get_current_location', {
      includeAddress: false,
    });

    expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
  });
});

function executeTool(tools: ToolSet, name: string, input: unknown) {
  const selected = tools[name] as Tool | undefined;
  if (!selected?.execute) {
    throw new Error(`Missing executable tool: ${name}`);
  }
  return selected.execute(input, { messages: [], toolCallId: 'call-1' });
}
