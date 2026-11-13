import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ConversationCitationReader,
  ConversationMessage,
  ResourceValue,
} from '@/frontend/appShell/conversation';

import { useMessageCitationSources } from '../useMessageCitationSources';

jest.mock('@/frontend/appShell/conversation', () => ({
  readToolCitations: jest.requireActual('@/frontend/appShell/conversation/readToolCitations')
    .readToolCitations,
}));
const answer: ConversationMessage = {
  key: 'answer',
  state: 'success',
  completeness: 'complete',
  actions: {},
  display: {
    id: 'answer',
    role: 'assistant',
    status: 'success',
    data: { parts: [{ type: 'text', text: 'Answer [cite:lookup-1]' }] },
  },
};
let current: readonly ConversationMessage[];
function Probe({
  messages,
  scope = 'desktop/session',
  revision = '1',
  reader,
}: {
  messages: readonly ConversationMessage[];
  scope?: string;
  revision?: string;
  reader?: ConversationCitationReader;
}) {
  const value = useMessageCitationSources(messages, scope, reader, revision);
  useLayoutEffect(() => {
    current = value;
  }, [value]);
  return null;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('admits prose before deferred tool sources finish and resolves without opening a detail', async () => {
  let resolve!: (value: ResourceValue) => void;
  const read = jest.fn(
    () =>
      new Promise<ResourceValue>((done) => {
        resolve = done;
      }),
  );
  const message = {
    ...answer,
    tools: [
      {
        key: 'call',
        title: 'mcp__cherry-tools__web_search',
        state: 'completed' as const,
        output: { kind: 'deferred' as const, key: 'output', read },
      },
    ],
  };
  const client = new QueryClient();
  let row!: ReactTestRenderer;
  await act(async () => {
    row = create(
      <QueryClientProvider client={client}>
        <Probe messages={[message]} />
      </QueryClientProvider>,
    );
  });
  expect(current[0]).toBe(message);
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({
      kind: 'json',
      complete: true,
      value: [{ id: 'lookup-1', title: 'Source', url: 'https://example.com' }],
    });
    await settle();
  });
  expect(current[0].display.data.citationSources).toMatchObject([
    { id: 'lookup-1', title: 'Source' },
  ]);
  await act(async () => row.unmount());
  client.clear();
});

it('does not reuse earlier lookup facts across a history revision or desktop scope', async () => {
  const client = new QueryClient();
  let count = 0;
  const reader = jest.fn(async () => [
    { id: 'lookup-1', title: String(++count), url: 'https://example.com' },
  ]);
  let row!: ReactTestRenderer;
  const render = (scope: string, revision: string) => (
    <QueryClientProvider client={client}>
      <Probe messages={[answer]} scope={scope} revision={revision} reader={reader} />
    </QueryClientProvider>
  );
  await act(async () => {
    row = create(render('desktop-a/session', '1'));
    await settle();
  });
  expect(current[0].display.data.citationSources?.[0].title).toBe('1');
  await act(async () => {
    row.update(render('desktop-a/session', '2'));
    await settle();
  });
  expect(current[0].display.data.citationSources?.[0].title).toBe('2');
  await act(async () => {
    row.update(render('desktop-b/session', '2'));
    await settle();
  });
  expect(current[0].display.data.citationSources?.[0].title).toBe('3');
  expect(reader).toHaveBeenCalledTimes(3);
  await act(async () => row.unmount());
  client.clear();
});
