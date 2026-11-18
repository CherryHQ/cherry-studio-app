import type { AgentPart } from '@cherrystudio/remote-protocol/agent';

import { readPresentationPart } from '../remotePresentation';

const data = (name: string, value: unknown): AgentPart => ({
  kind: 'data',
  partId: 'source-part',
  revision: '1',
  name,
  content: { text: JSON.stringify(value) },
});

test('preserves citable facts from live and persisted desktop source envelopes', () => {
  const source = { sourceId: 'lookup-1', url: 'https://example.com/page', title: 'Page' };
  expect(readPresentationPart(data('source-url', { type: 'source-url', ...source }))).toEqual({
    id: 'source-part',
    type: 'source-url',
    ...source,
  });
  expect(readPresentationPart(data('source-url', source))).toMatchObject(source);
});

test('does not promote unknown or invalid desktop data into visible content', () => {
  expect(
    readPresentationPart(data('source-url', { sourceId: 's', url: 'file:///secret' })),
  ).toBeUndefined();
  expect(readPresentationPart(data('text', { text: 'injected text' }))).toBeUndefined();
  expect(
    readPresentationPart(data('data-compaction-anchor', { data: { status: 'made-up' } })),
  ).toBeUndefined();
});

test('keeps supported compaction facts without requiring private summary text', () => {
  const part = readPresentationPart(
    data('data-compaction-anchor', {
      data: { status: 'done', phase: 'agent-session', preTokens: 20, postTokens: 10 },
    }),
  );
  expect(part).toMatchObject({
    type: 'data-compaction-anchor',
    data: { preTokens: 20, postTokens: 10 },
  });
});
