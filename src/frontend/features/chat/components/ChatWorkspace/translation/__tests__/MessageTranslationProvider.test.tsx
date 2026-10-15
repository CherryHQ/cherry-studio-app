import { useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage } from '@/frontend/appShell/conversation';
import { cacheService } from '@/frontend/data/CacheService';
import type { TranslationInput, TranslationOptions } from '@/shared/contracts/translation';

import { MessageTranslationProvider, useMessageTranslation } from '../MessageTranslationProvider';

let mockLanguage = 'en-US';
const mockTranslate = jest.fn<Promise<string>, [TranslationInput, TranslationOptions?]>();
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: mockLanguage } }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ translate: mockTranslate }),
}));
jest.mock('@/frontend/data/CacheService', () => {
  const { CacheService, createInMemoryKvStorage } = jest.requireActual(
    '@/frontend/data/CacheService',
  );
  return { cacheService: new CacheService(createInMemoryKvStorage()) };
});
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

function Harness() {
  return (
    <MessageTranslationProvider messages={messages} scope="local" sessionId="session">
      <Reader />
    </MessageTranslationProvider>
  );
}

let renderer: ReactTestRenderer;
beforeEach(() => {
  mockLanguage = 'en-US';
  mockTranslate.mockReset().mockResolvedValue('Traduction');
  cacheService.deletePersist('chat.translations');
});
afterEach(() => {
  act(() => renderer?.unmount());
});

test('switches translation language without resetting reader state and rejects the old request', async () => {
  let finishOld!: (value: string) => void;
  const oldResult = new Promise<string>((resolve) => {
    finishOld = resolve;
  });
  mockTranslate.mockImplementationOnce(() => oldResult);
  act(() => {
    renderer = create(<Harness />);
  });
  act(() => moveReadingPosition('current reading position'));
  const previous = translation!;
  let pending!: Promise<void>;
  act(() => {
    pending = previous.store.start(previous.source);
  });
  const oldOptions = mockTranslate.mock.calls[0][1];

  mockLanguage = 'fr-FR';
  act(() => renderer.update(<Harness />));

  expect(readingPosition).toBe('current reading position');
  expect(translation!.store).not.toBe(previous.store);
  expect(translation!.store.language).toBe('fr-FR');
  expect(translation!.state.status).toBe('idle');
  expect(oldOptions?.signal?.aborted).toBe(true);
  await act(async () => {
    oldOptions?.onText?.('late text');
    finishOld('late result');
    await pending;
  });
  expect(cacheService.getPersist('chat.translations')).toEqual({});

  await act(async () => {
    await translation!.store.start(translation!.source);
  });
  expect(mockTranslate.mock.calls[1][0].language).toBe('fr-FR');
  expect(translation!.state).toMatchObject({ content: 'Traduction', status: 'success' });
  expect(readingPosition).toBe('current reading position');
});
