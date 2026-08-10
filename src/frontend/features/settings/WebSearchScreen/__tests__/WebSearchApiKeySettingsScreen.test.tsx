import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { WebSearchApiKeyEntry } from '../apiService';
import WebSearchApiKeySettingsScreen from '../WebSearchApiKeySettingsScreen';

type KeyFormProps = {
  apiKeys: readonly WebSearchApiKeyEntry[];
  onAdd: () => void;
  onCommitKey: (id: string, key: string) => void;
  onRemove: (id: string) => void;
};
type ProviderOverrides = Record<string, { apiKeys?: string[] } | undefined>;

let mockProviderOverrides: ProviderOverrides;
let mockKeyFormProps: KeyFormProps | undefined;
const mockSetPreference = jest.fn();
const mockAlertConfirm = jest.fn();
const mockAlertShow = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ providerId: 'tavily' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({
    alert: {
      confirm: mockAlertConfirm,
      show: mockAlertShow,
    },
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockProviderOverrides, mockSetPreference],
}));

// Keep the real hook and key helpers; only the row UI is stubbed so the test can drive it.
jest.mock('../apiService', () => ({
  ...jest.requireActual('../apiService/utils/webSearchApiServiceApiKeys'),
  ...jest.requireActual('../apiService/hooks/useWebSearchApiKeySettings'),
  WebSearchApiServiceApiKeyForm: (props: KeyFormProps) => {
    mockKeyFormProps = props;
    return null;
  },
}));

describe('WebSearchApiKeySettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function render() {
    act(() => {
      renderer = create(<WebSearchApiKeySettingsScreen />);
    });
  }

  function keyForm() {
    if (!mockKeyFormProps) {
      throw new Error('The API key form was not rendered.');
    }

    return mockKeyFormProps;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderOverrides = { tavily: { apiKeys: ['key-a'] } };
    mockKeyFormProps = undefined;
    mockSetPreference.mockImplementation(async (next: ProviderOverrides) => {
      mockProviderOverrides = next;
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the stored keys on the first frame', () => {
    render();

    expect(keyForm().apiKeys.map((entry) => entry.key)).toEqual(['key-a']);
  });

  // The screen used to drop a newly added row after saving it and rely on the preference
  // store pushing it back as a stored row. Nothing pushes it back now, so the row has to
  // be promoted in place — otherwise a key the user just saved vanishes from the list.
  it('keeps a newly added key visible after it is saved', async () => {
    render();

    act(() => keyForm().onAdd());
    const addedId = keyForm().apiKeys.at(-1)?.id ?? '';
    await act(async () => {
      keyForm().onCommitKey(addedId, 'key-b');
    });

    expect(keyForm().apiKeys.map((entry) => entry.key)).toEqual(['key-a', 'key-b']);
    expect(keyForm().apiKeys.at(-1)?.isNew).toBe(false);
    expect(mockProviderOverrides).toEqual({ tavily: { apiKeys: ['key-a', 'key-b'] } });
  });

  it('drops a blank added row instead of saving it', async () => {
    render();

    act(() => keyForm().onAdd());
    const addedId = keyForm().apiKeys.at(-1)?.id ?? '';
    await act(async () => {
      keyForm().onCommitKey(addedId, '   ');
    });

    expect(keyForm().apiKeys.map((entry) => entry.key)).toEqual(['key-a']);
    expect(mockProviderOverrides).toEqual({ tavily: { apiKeys: ['key-a'] } });
  });

  it('refuses a duplicate key without writing it', async () => {
    render();

    act(() => keyForm().onAdd());
    const addedId = keyForm().apiKeys.at(-1)?.id ?? '';
    await act(async () => {
      keyForm().onCommitKey(addedId, 'key-a');
    });

    expect(mockProviderOverrides).toEqual({ tavily: { apiKeys: ['key-a'] } });
    expect(keyForm().apiKeys.at(-1)?.isNew).toBe(true);
  });

  it('restores an optimistically removed key and shows an Alert when saving fails', async () => {
    const saving = deferred<void>();
    mockSetPreference.mockReturnValueOnce(saving.promise);
    render();
    const keyId = keyForm().apiKeys[0].id;

    act(() => keyForm().onRemove(keyId));
    act(() => mockAlertConfirm.mock.calls[0][0].onConfirm());
    expect(keyForm().apiKeys).toEqual([]);

    saving.reject(new Error('save failed'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(keyForm().apiKeys.map((entry) => entry.key)).toEqual(['key-a']);
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'settings.websearch.provider.saveFailed',
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
