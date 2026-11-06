import type { MessageQuote } from '@/shared/contracts/agent';

import {
  createQuoteMention,
  createQuoteMentionLabel,
  readQuoteMentions,
  restoreQuoteMentions,
} from '../quoteMentions';

const first: MessageQuote = {
  id: 'first',
  sourceMessageId: '00000000-0000-7000-8000-000000000001',
  text: '  First [passage]\\\nwith its complete context.  ',
};
const second: MessageQuote = {
  id: 'second',
  sourceMessageId: '00000000-0000-7000-8000-000000000002',
  text: '第二段原文',
};

test('normalizes only the excerpt and keeps both quotation marks when shortening', () => {
  expect(createQuoteMentionLabel('  I enjoy\nreading.  ')).toBe('“I enjoy reading.”');
  expect(createQuoteMentionLabel('🍒'.repeat(33))).toBe(`“${'🍒'.repeat(32)}…”`);
});

test('multiple quotes retain their order, complete snapshots and individual comments', () => {
  const draft = `说明：${createQuoteMention(second)} 我的回答\n${createQuoteMention(first)} 继续追问`;
  const parsed = readQuoteMentions(draft, [first, second]);
  expect(parsed.text).toBe(
    `说明：${createQuoteMentionLabel(second.text)} 我的回答\n${createQuoteMentionLabel(first.text)} 继续追问`,
  );
  expect(parsed.quotes.map((quote) => quote.id)).toEqual(['second', 'first']);
  expect(parsed.quotes[1].text).toBe(first.text);
  for (const quote of parsed.quotes) {
    expect(
      parsed.text.slice(
        quote.reference!.offset,
        quote.reference!.offset + quote.reference!.label.length,
      ),
    ).toBe(quote.reference!.label);
  }
  expect(restoreQuoteMentions(parsed.text, parsed.quotes)).toBe(draft);
});

test('shifts subsequent reference offsets past removed syntax and escaped labels', () => {
  const draft = `before ${createQuoteMention(first)} after`;
  const parsed = readQuoteMentions(draft, [first]);
  expect(parsed.shift(draft.indexOf('after'))).toBe(parsed.text.indexOf('after'));
  expect(parsed.shift(0)).toBe(0);
});

test('deleted and unknown references cannot attach a stale quote', () => {
  expect(readQuoteMentions('My answer', [first]).quotes).toEqual([]);
  const parsed = readQuoteMentions(createQuoteMention(first), []);
  expect(parsed.quotes).toEqual([]);
  expect(parsed.text).toBe(createQuoteMentionLabel(first.text));
  const escaped = `\\${createQuoteMention(first)}`;
  expect(readQuoteMentions(escaped, [first])).toMatchObject({ text: escaped, quotes: [] });
});

test('repeated pasted references keep separate positions and legacy snapshots restore as inline quotes', () => {
  const parsed = readQuoteMentions(
    `${createQuoteMention(first)} A ${createQuoteMention(first)} B`,
    [first],
  );
  expect(parsed.quotes).toHaveLength(2);
  expect(parsed.quotes[0].reference!.offset).toBeLessThan(parsed.quotes[1].reference!.offset);
  expect(restoreQuoteMentions('Why?', [second])).toBe(`${createQuoteMention(second)}\nWhy?`);
});
