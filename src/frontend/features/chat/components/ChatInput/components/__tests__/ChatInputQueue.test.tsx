import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentQueuedInput } from '@/shared/contracts/agent';

import { ChatInputQueue } from '../ChatInputQueue';

let mockInputs: AgentQueuedInput[] = [];
jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);
jest.mock('@cherrystudio/ui/components', () => ({
  Button: () => null,
  Surface: ({ children }: { children: ReactNode }) => children,
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === 'chat.quote.line' ? `${values?.author}: ${values?.text}` : key,
  }),
}));
jest.mock('../../../../runtime', () => ({
  useAgentChatClient: () => ({ client: {} }),
  useAgentQueuedInputs: () => mockInputs,
}));

const queued = (parts: AgentQueuedInput['userMessage']['parts']) =>
  ({ turnId: 't', userMessage: { parts } }) as unknown as AgentQueuedInput;

test('a queued request shows its words, then one quiet line for attachments and its quote', () => {
  mockInputs = [
    queued([
      {
        id: 'p',
        type: 'text',
        state: 'done',
        text: 'Make it work offline',
        quotes: [
          {
            id: 'q',
            sourceMessageId: '00000000-0000-7000-8000-000000000001',
            text: 'Store **records** in the browser',
          },
        ],
        quoteAuthor: { role: 'assistant', name: 'Cherry' },
      },
      {
        id: 'f',
        type: 'file',
        fileEntryId: 'f',
        mediaType: 'image/png',
        filename: 'sketch.png',
        purpose: 'input-attachment',
      },
    ]),
  ];
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ChatInputQueue sessionId="s" />);
  });
  const texts = renderer.root
    .findAllByType('Text' as never)
    .map((node) => [node.props.children].flat().join(''));
  expect(texts).toContain('Make it work offline');
  expect(texts).toContain('sketch.png · Cherry: Store records in the browser');
  act(() => renderer.unmount());
});
