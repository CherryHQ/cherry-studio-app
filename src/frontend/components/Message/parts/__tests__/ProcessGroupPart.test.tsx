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

  test('uses the persisted message lifetime as the total process duration', () => {
    const part = { state: 'done' as const, text: 'Reasoning', type: 'reasoning' as const };
    const message: MessageListItem = {
      createdAt: '2026-09-02T00:00:00.000Z',
      data: { parts: [part] },
      id: 'assistant-1',
      role: 'assistant',
      status: 'success',
      updatedAt: '2026-09-02T00:00:16.000Z',
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
      title: '用时 16秒',
    });
  });
});
