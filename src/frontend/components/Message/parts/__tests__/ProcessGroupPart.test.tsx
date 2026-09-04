import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '../../types';
import { ProcessGroupPart } from '../ProcessGroupPart';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePart: {
      Process: ({ children, ...props }: { children: unknown }) =>
        createElement('MessagePartProcess', props, children),
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: { seconds: number }) =>
      key === 'chat.process.duration' ? `用时 ${values.seconds}秒` : key,
  }),
}));

jest.mock('../MessagePartRenderer', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePartRenderer: (props: object) => createElement('MessagePartRenderer', props),
  };
});

jest.mock('../../list/MessageListDisclosureContext', () => ({
  useMessageListDisclosureToggle: () => jest.fn(),
}));

describe('ProcessGroupPart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('uses runtime timing and excludes overlapping approval waits', () => {
    const part = { state: 'done' as const, text: 'Reasoning', type: 'reasoning' as const };
    const message: MessageListItem = {
      createdAt: '2026-09-02T00:00:00.000Z',
      data: { parts: [part] },
      id: 'assistant-1',
      role: 'assistant',
      status: 'success',
      stats: {
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 21_000,
          spans: [
            {
              id: 'approval:one',
              kind: 'approval-wait',
              approvalId: 'one',
              toolCallId: 'tool-one',
              startedAt: 3_000,
              completedAt: 6_000,
            },
            {
              id: 'approval:two',
              kind: 'approval-wait',
              approvalId: 'two',
              toolCallId: 'tool-two',
              startedAt: 5_000,
              completedAt: 9_000,
            },
          ],
        },
      },
    };

    act(() => {
      renderer = create(
        <ProcessGroupPart
          citationText={new Map()}
          isTextSelectionEnabled
          items={[{ index: 0, key: 'reasoning-1', part }]}
          message={message}
          messageParts={[part]}
          renderMode="markdown"
        />,
      );
    });

    expect(renderer!.root.findByType('MessagePartProcess').props).toMatchObject({
      state: 'complete',
      title: '用时 14秒',
    });
    expect(renderer!.root.findByType('MessagePartRenderer').props.isStreaming).toBe(false);
  });
});
