import { generateKeyBetween } from 'fractional-indexing';

import { mockChatAssistants, mockChatModels, mockTopicMessages } from '../chat';

describe('mock chat fixtures', () => {
  // `insertWithOrderKey` allocates the next key from the largest one already in
  // the table, so one malformed fixture key breaks every later insert into it —
  // for the topic table that means "sending a message" fails with a bare
  // `invalid order key` error, nowhere near the fixture that caused it.
  test.each([
    ['models', mockChatModels.map((model) => ({ id: model.id, orderKey: model.orderKey }))],
    [
      'assistants',
      mockChatAssistants.map((assistant) => ({
        id: assistant.id,
        orderKey: assistant.orderKey,
      })),
    ],
    ['topics', mockTopicMessages.map(({ topic }) => ({ id: topic.id, orderKey: topic.orderKey }))],
  ])('%s can anchor a following insert', (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(() => generateKeyBetween(row.orderKey, null)).not.toThrow();
    }
  });

  // Guards the check above: `c4` is exactly the shape these fixtures used to
  // hand-write, and it looks perfectly reasonable until you try to insert after it.
  test('rejects the hand-written key shape that used to break topic inserts', () => {
    expect(() => generateKeyBetween('c4', null)).toThrow('invalid order key');
  });

  test('order keys are unique per table', () => {
    const topicOrderKeys = mockTopicMessages.map(({ topic }) => topic.orderKey);

    expect(new Set(topicOrderKeys).size).toBe(topicOrderKeys.length);
  });
});
