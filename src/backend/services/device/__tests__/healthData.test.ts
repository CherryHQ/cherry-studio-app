import { queryHealthData, type HealthDataReaderLoader } from '../healthData';

const input = {
  type: 'sleep',
  startDate: '2026-09-01T00:00:00Z',
  endDate: '2026-09-02T00:00:00Z',
  limit: 50,
  cursor: '',
  mode: 'samples' as const,
  granularity: 'summary' as const,
  workoutId: '',
  reselectRecords: false,
};

describe('health query semantics', () => {
  test.each([
    { type: 'sleep', mode: 'statistics' as const },
    { type: 'steps', mode: 'statistics' as const, cursor: 'old-page' },
    { type: 'dateOfBirth', workoutId: 'workout-1' },
    { type: 'sleep', reselectRecords: true },
  ])('rejects unsupported query combinations before reading native data: %j', async (changes) => {
    const load = jest.fn() as jest.MockedFunction<HealthDataReaderLoader>;
    await expect(queryHealthData({ ...input, ...changes }, load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  test('preserves the whole-calendar-day meaning of activity rings', async () => {
    const note = 'Activity rings cover whole local calendar days; partial days are not prorated.';
    const load = (async () => ({
      query: async () => ({ data: [], intervalNote: note }),
    })) as unknown as HealthDataReaderLoader;
    const result = await queryHealthData({ ...input, type: 'activitySummary' }, load);
    expect(result.intervalNote).toBe(note);
  });
});
