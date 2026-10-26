import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { VoiceError, type DictationOptions } from '@/shared/contracts/voice';

import { useDictation } from '../useDictation';

const mockToast = jest.fn();
const mockConfirm = jest.fn();
// The composer's draft state: functional updates apply to the current draft.
const mockSetDraft = jest.fn((next: string | ((current: string) => string)) => {
  mockDraft = typeof next === 'function' ? next(mockDraft) : next;
});
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
    expect(mockDraft).toBe('Meeting notes: first draft');
    await act(async () => result.resolve('final words'));
    expect(mockDraft).toBe('Meeting notes: final words');
    expect(dictation.state).toBe('idle');
  });

  test.each([
    ['sending', ''],
    ['typing', 'Meeting notes: first, edited'],
  ])('%s during dictation cancels it and hands the draft back', async (_action, edited) => {
    await act(async () => {
      void dictation.start();
    });
    act(() => options.onText?.('first'));
    mockDraft = edited;
    act(() => renderer.update(<Probe />));
    expect(options.signal?.aborted).toBe(true);
    await act(async () => undefined);
    expect(mockDraft).toBe(edited);
    expect(dictation.state).toBe('idle');
    expect(mockToast).not.toHaveBeenCalled();
  });

  test('typing before the first recognition result cancels dictation', async () => {
    await act(async () => {
      void dictation.start();
    });
    mockDraft = 'Meeting notes: typed instead';
    act(() => renderer.update(<Probe />));
    expect(options.signal?.aborted).toBe(true);
    await act(async () => undefined);
    expect(mockDraft).toBe('Meeting notes: typed instead');
  });

  test('cancelling restores the draft as it was, without an error', async () => {
    await act(async () => {
      void dictation.start();
    });
    act(() => options.onText?.('half a sentence'));
    await act(async () => dictation.cancel());
    expect(mockDraft).toBe('Meeting notes:');
    expect(mockToast).not.toHaveBeenCalled();
  });

  test('a failure, including the app ending dictation, restores the draft and reports it', async () => {
    await act(async () => {
      void dictation.start();
    });
    act(() => options.onText?.('half a sentence'));
    await act(async () => result.reject(new DOMException('backgrounded', 'AbortError')));
    expect(mockDraft).toBe('Meeting notes:');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'voice.error.failed' }),
    );
    expect(dictation.state).toBe('idle');
  });

  test('a blocked permission offers system settings instead of a toast', async () => {
    mockStartDictation.mockRejectedValueOnce(new VoiceError('permission-blocked', 'denied'));
    await act(async () => dictation.start());
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: 'settings.permissions.openSystemSettings' }),
    );
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockDraft).toBe('Meeting notes:');
  });
});
