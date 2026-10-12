import { CacheService, cacheService } from '@/frontend/data/CacheService';

import {
  feedbackHistoryRecords,
  FEEDBACK_HISTORY_KEY,
  rememberFeedback,
  rememberFeedbackStatus,
} from '../feedbackHistory';

jest.mock('@/frontend/data/CacheService', () => {
  const actual = jest.requireActual('@/frontend/data/CacheService');
  const storage = actual.createInMemoryKvStorage();
  return { ...actual, cacheService: new actual.CacheService(storage), testStorage: storage };
});
const id = '550e8400-e29b-41d4-a716-446655440000';
const secondId = '650e8400-e29b-41d4-a716-446655440000';
const found = {
  status: 'found' as const,
  reportId: id,
  processingStatus: 'investigating' as const,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
};

beforeEach(() => cacheService.deletePersist(FEEDBACK_HISTORY_KEY));
afterEach(() => jest.restoreAllMocks());

test('submission receipts persist across cache reconstruction and retain Unicode feedback', () => {
  rememberFeedback(id, '中文\n😀');
  const { testStorage } = jest.requireMock('@/frontend/data/CacheService');
  const reloaded = new CacheService(testStorage);
  expect(reloaded.getPersist(FEEDBACK_HISTORY_KEY)).toEqual([
    expect.objectContaining({
      reportId: id,
      description: '中文\n😀',
      processingStatus: 'pending',
      isUnavailable: false,
    }),
  ]);
});

test('records sort newest first, deduplicate, and isolate malformed persisted entries', () => {
  rememberFeedback(id, 'first');
  const first = cacheService.getPersist(FEEDBACK_HISTORY_KEY)[0];
  const newer = { ...first, reportId: secondId, submittedAt: '2099-01-01T00:00:00Z' };
  expect(feedbackHistoryRecords([first, { reportId: 'broken' }, newer, first])).toEqual([
    newer,
    first,
  ]);
  expect(feedbackHistoryRecords(null)).toEqual([]);
});

test('failed lookups preserve the last known status and successful checks update only their record', () => {
  rememberFeedback(id, 'first');
  rememberFeedback(secondId, 'second');
  const before = cacheService.getPersist(FEEDBACK_HISTORY_KEY);
  rememberFeedbackStatus(id, { status: 'failed', reason: 'unavailable' });
  expect(cacheService.getPersist(FEEDBACK_HISTORY_KEY)).toBe(before);
  rememberFeedbackStatus(id, found);
  const records = cacheService.getPersist(FEEDBACK_HISTORY_KEY);
  expect(records.find((record) => record.reportId === id)).toMatchObject({
    processingStatus: 'investigating',
    statusUpdatedAt: found.updatedAt,
    lastCheckedAt: expect.any(String),
  });
  expect(records.find((record) => record.reportId === secondId)).toEqual(
    before.find((record) => record.reportId === secondId),
  );
});

test('404 keeps the receipt and later availability recovers it; cleared history is not recreated by an in-flight read', () => {
  rememberFeedback(id, 'keep this');
  rememberFeedbackStatus(id, { status: 'not_found' });
  expect(cacheService.getPersist(FEEDBACK_HISTORY_KEY)[0]).toMatchObject({
    description: 'keep this',
    isUnavailable: true,
  });
  rememberFeedbackStatus(id, found);
  expect(cacheService.getPersist(FEEDBACK_HISTORY_KEY)[0].isUnavailable).toBe(false);
  cacheService.deletePersist(FEEDBACK_HISTORY_KEY);
  rememberFeedbackStatus(id, found);
  expect(cacheService.getPersist(FEEDBACK_HISTORY_KEY)).toEqual([]);
});
