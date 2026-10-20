import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { VoiceError, type DictationOptions } from '@/shared/contracts/voice';

import { useDictation } from '../useDictation';

const mockToast = jest.fn();
const mockConfirm = jest.fn();
const mockSetDraft = jest.fn();
const mockStartDictation = jest.fn();
let mockDraft = '';

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerActions: () => ({ setDraft: mockSetDraft }),
  useComposerState: () => ({ draft: mockDraft }),
}));
jest.mock('@/frontend/components/AiFailure', () => ({ aiFailureReasonTitleKey: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useBackendModule: (key: string) =>
    key === 'voice' ? { startDictation: mockStartDictation } : { openSystemSettings: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('dictation into the composer draft', () => {
  let renderer: ReactTestRenderer;
  let dictation: ReturnType<typeof useDictation>;
  let options: DictationOptions;
  let result: ReturnType<typeof deferred<string>>;

  function Probe() {
    dictation = useDictation();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockDraft = 'Meeting notes:';
    result = deferred<string>();
    mockStartDictation.mockImplementation(async (start: DictationOptions) => {
      options = start;
      start.signal?.addEventListener('abort', () => result.reject(start.signal?.reason));
      return { result: result.promise, stop: jest.fn() };
    });
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => act(() => renderer.unmount()));

  test('live text follows what was typed and the final transcript replaces it', async () => {
    await act(async () => {
      void dictation.start();
    });
    expect(dictation.state).toBe('listening');
    act(() => options.onText?.('first draft'));
    expect(mockSetDraft).toHaveBeenLastCalledWith('Meeting notes: first draft');
    await act(async () => result.resolve('final words'));
    expect(mockSetDraft).toHaveBeenLastCalledWith('Meeting notes: final words');
    expect(dictation.state).toBe('idle');
  });

  test('cancelling restores the draft as it was, without an error', async () => {
    await act(async () => {
      void dictation.start();
    });
    act(() => options.onText?.('half a sentence'));
    await act(async () => dictation.cancel());
    expect(mockSetDraft).toHaveBeenLastCalledWith('Meeting notes:');
    expect(mockToast).not.toHaveBeenCalled();
  });

  test('a blocked permission offers system settings instead of a toast', async () => {
    mockStartDictation.mockRejectedValueOnce(new VoiceError('permission-blocked', 'denied'));
    await act(async () => dictation.start());
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: 'settings.permissions.openSystemSettings' }),
    );
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockSetDraft).toHaveBeenLastCalledWith('Meeting notes:');
  });
});
