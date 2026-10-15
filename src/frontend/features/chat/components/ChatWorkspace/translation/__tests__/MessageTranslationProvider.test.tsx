import { useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { TranslationInput, TranslationOptions } from '@/shared/contracts/translation';

import { MessageTranslationProvider, useMessageTranslation } from '../MessageTranslationProvider';

let mockLanguage = 'en-US';
const mockTranslate = jest.fn<Promise<string>, [TranslationInput, TranslationOptions?]>();
const mockDataApi = {
  patch: jest.fn(async () => {}),
};
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: mockLanguage } }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ translate: mockTranslate }),
}));
jest.mock('@/frontend/data/DataApiProvider', () => ({ useApiClient: () => mockDataApi }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(effect, [effect]);
  },
}));

const message: ConversationMessage = {
  key: 'answer',
  state: 'success',
  completeness: 'complete',
  actions: {},
  display: {
    id: 'answer',
    role: 'assistant',
    status: 'success',
    data: { parts: [{ type: 'text', text: 'Original answer' }] },
  },
};
const messages = [message];
let translation: ReturnType<typeof useMessageTranslation>;
let readingPosition: string;
let moveReadingPosition: (position: string) => void;

function Reader() {
  const [position, setPosition] = useState('search target');
  const current = useMessageTranslation(message.display);
  useEffect(() => {
    readingPosition = position;
    moveReadingPosition = setPosition;
    translation = current;
  }, [current, position]);
  return null;
}

function Harness({ isEnabled = true }: { isEnabled?: boolean }) {
  return (
    <MessageTranslationProvider messages={messages} isEnabled={isEnabled} sessionId="session">
      <Reader />
    </MessageTranslationProvider>
  );
}

let renderer: ReactTestRenderer;
beforeEach(() => {
  mockLanguage = 'en-US';
  mockTranslate.mockReset().mockResolvedValue('Traduction');
  mockDataApi.patch.mockClear();
});
afterEach(() => {
  act(() => renderer?.unmount());
});

test('does not expose translation when the conversation does not enable local message translation', () => {
  act(() => {
    renderer = create(<Harness isEnabled={false} />);
  });
  expect(translation).toBeUndefined();
  expect(mockTranslate).not.toHaveBeenCalled();
  expect(mockDataApi.patch).not.toHaveBeenCalled();
});

test('changing the app language preserves the chosen target, pending request and reader state', async () => {
  let finishOld!: (value: string) => void;
  const oldResult = new Promise<string>((resolve) => {
    finishOld = resolve;
  });
  mockTranslate.mockImplementationOnce(() => oldResult);
  await act(async () => {
    renderer = create(<Harness />);
  });
  act(() => moveReadingPosition('current reading position'));
  const previous = translation!;
  let pending!: Promise<void>;
  await act(async () => {
    pending = previous.store.start(previous.source, 'zh-CN');
  });
  const oldOptions = mockTranslate.mock.calls[0][1];

  mockLanguage = 'fr-FR';
  act(() => renderer.update(<Harness />));

  expect(readingPosition).toBe('current reading position');
  expect(translation!.store).toBe(previous.store);
  expect(translation!.state).toMatchObject({ language: 'zh-CN', status: 'running' });
  expect(oldOptions?.signal?.aborted).toBe(false);
  await act(async () => {
    oldOptions?.onText?.('译');
    finishOld('译文');
    await pending;
  });
  expect(mockTranslate).toHaveBeenCalledTimes(1);
  expect(translation!.state).toMatchObject({
    content: '译文',
    language: 'zh-CN',
    status: 'success',
  });
  expect(readingPosition).toBe('current reading position');
});
