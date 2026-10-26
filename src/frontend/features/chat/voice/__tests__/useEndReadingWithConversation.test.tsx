import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useEndReadingWithConversation } from '../useMessageSpeech';

const mockStopSpeaking = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/AiFailure', () => ({ aiFailureReasonTitleKey: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ stopSpeaking: mockStopSpeaking }),
}));

function Conversation({ id }: { id: string }) {
  useEndReadingWithConversation(id);
  return null;
}

test('switching or closing the conversation ends its reading', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation id="a" />);
  });
  expect(mockStopSpeaking).not.toHaveBeenCalled();
  act(() => renderer.update(<Conversation id="b" />));
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
  expect(mockStopSpeaking).toHaveBeenCalledTimes(2);
});
