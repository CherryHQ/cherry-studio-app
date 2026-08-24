import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { ChatProvider } from '../ChatProvider';

const mockInvalidateQueries = jest.fn(async () => undefined);
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockSubscribe = jest.fn();
const mockToastShow = jest.fn();
const mockUnsubscribe = jest.fn();
let mockListener: ((event: unknown) => Promise<void> | void) | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: { topics: { all: () => ['topics'] } },
  useBackendModule: () => ({
    subscribe: (listener: typeof mockListener) => {
      mockListener = listener;
      mockSubscribe(listener);
      return mockUnsubscribe;
    },
  }),
}));

jest.mock('@/frontend/hooks/chat/utils/messageQueryOptions', () => ({
  getMessagesQueryKey: (topicId: string) => ['messages', topicId],
}));

describe('ChatProvider', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('turns a background topic rename failure into one localized danger Toast', async () => {
    act(() => {
      renderer = create(<ChatProvider />);
    });

    await act(async () => {
      await mockListener?.({
        topicId: 'topic-1',
        type: 'topic-rename-failed',
      });
    });

    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'topic.rename.failed',
      variant: 'danger',
    });
  });
});
