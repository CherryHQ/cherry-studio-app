import { createPreviewAiUsageData, getPreviewAiUsageDayCount } from '../previewAiUsageData';

describe('createPreviewAiUsageData', () => {
  test('generates an inclusive local-date range ending on endDate', () => {
    const data = createPreviewAiUsageData(new Date(2026, 0, 2), 4);

    expect(Object.keys(data)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });

  test('only produces supported activity levels', () => {
    const levels = Object.values(createPreviewAiUsageData(new Date(2026, 6, 19), 371));

    expect(levels).toHaveLength(371);
    for (const level of levels) {
      expect([0, 1, 2, 3, 4]).toContain(level);
    }
  });

  test('rejects invalid ranges', () => {
    expect(() => createPreviewAiUsageData(new Date(2026, 6, 19), 0)).toThrow(RangeError);
    expect(() => createPreviewAiUsageData(new Date(2026, 6, 19), 1.5)).toThrow(RangeError);
  });
});

describe('getPreviewAiUsageDayCount', () => {
  test('matches the reference sizing formula', () => {
    expect(getPreviewAiUsageDayCount(393)).toBe(117);
  });

  test('never returns less than one day', () => {
    expect(getPreviewAiUsageDayCount(0)).toBe(1);
  });
});
