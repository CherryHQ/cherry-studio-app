import type { Tool, ToolSet } from 'ai';

import { createHealthTools } from '../healthTools';

const mockHealthKit = {
  getAggregatedQuantity: jest.fn(async () => 100),
  getCategoryData: jest.fn(async () => []),
  getQuantityData: jest.fn(async () => []),
  getWorkouts: jest.fn(async () => []),
};

describe('health tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns only requested summary metrics', async () => {
    mockHealthKit.getCategoryData.mockResolvedValue([
      sleepSample(0, '2026-07-28T21:00:00Z', '2026-07-28T23:00:00Z'),
      sleepSample(3, '2026-07-28T23:00:00Z', '2026-07-29T01:00:00Z'),
      sleepSample(2, '2026-07-29T01:00:00Z', '2026-07-29T01:30:00Z'),
    ] as never);
    const tools = createHealthTools(async () => mockHealthKit as never);

    const result = (await executeTool(tools, 'builtin_get_health_summary', {
      endDate: '2026-07-29T02:00:00Z',
      granularity: 'summary',
      metrics: ['steps', 'sleep'],
      startDate: '2026-07-28T20:00:00Z',
    })) as { data: Record<string, { value: number }> };

    expect(result.data).toEqual({
      sleep: { unit: 'hours', value: 2 },
      steps: { unit: 'count', value: 100 },
    });
    expect(mockHealthKit.getAggregatedQuantity).toHaveBeenCalledTimes(1);
  });

  test('daily sleep aggregation excludes in-bed and awake samples', async () => {
    mockHealthKit.getCategoryData.mockResolvedValue([
      sleepSample(0, '2026-07-28T21:00:00Z', '2026-07-28T23:00:00Z'),
      sleepSample(4, '2026-07-28T23:00:00Z', '2026-07-29T00:00:00Z'),
      sleepSample(2, '2026-07-29T00:00:00Z', '2026-07-29T00:30:00Z'),
    ] as never);
    const tools = createHealthTools(async () => mockHealthKit as never);

    const result = (await executeTool(tools, 'builtin_get_health_summary', {
      endDate: '2026-07-29T02:00:00Z',
      granularity: 'day',
      metrics: ['sleep'],
      startDate: '2026-07-28T20:00:00Z',
    })) as { data: { metrics: { sleep: { value: number } } }[] };

    expect(result.data).toHaveLength(1);
    expect(result.data[0].metrics.sleep.value).toBe(1);
  });

  test('caps workout results at 50', async () => {
    mockHealthKit.getWorkouts.mockResolvedValue(
      Array.from({ length: 60 }, (_, index) => ({
        duration: 1800,
        endDate: new Date(`2026-07-28T${String((index % 20) + 1).padStart(2, '0')}:30:00Z`),
        startDate: new Date(`2026-07-28T${String((index % 20) + 1).padStart(2, '0')}:00:00Z`),
        workoutActivityName: 'Running',
        workoutActivityType: 37,
      })) as never,
    );
    const tools = createHealthTools(async () => mockHealthKit as never);

    const result = (await executeTool(tools, 'builtin_list_workouts', {
      endDate: '2026-07-29T00:00:00Z',
      limit: 50,
      startDate: '2026-07-28T00:00:00Z',
    })) as unknown[];

    expect(result).toHaveLength(50);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test('rejects health queries longer than 90 days before loading native HealthKit', async () => {
    const loadHealthKit = jest.fn(async () => mockHealthKit as never);

    await expect(
      executeTool(createHealthTools(loadHealthKit), 'builtin_get_health_summary', {
        endDate: '2026-04-02T00:00:00Z',
        granularity: 'summary',
        startDate: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('cannot exceed 90 days');
    expect(loadHealthKit).not.toHaveBeenCalled();
  });
});

function sleepSample(value: number, startDate: string, endDate: string) {
  return { endDate: new Date(endDate), startDate: new Date(startDate), value };
}

function executeTool(tools: ToolSet, name: string, input: unknown) {
  const selected = tools[name] as Tool | undefined;
  if (!selected?.execute) {
    throw new Error(`Missing executable tool: ${name}`);
  }
  return selected.execute(input, { messages: [], toolCallId: 'call-1' });
}
