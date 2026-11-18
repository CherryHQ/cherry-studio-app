import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import type { PreferenceClient } from '@/shared/data/preference';

import { EnterToSendSetting } from '../EnterToSendSetting';

const mockToastShow = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  Section: { SwitchItem: 'SwitchItem' },
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('EnterToSendSetting', () => {
  let renderer: ReactTestRenderer;
  let saved: boolean | undefined;
  let client: PreferenceClient;
  let listeners: Set<() => void>;
  const write = jest.fn<Promise<void>, [boolean]>();

  beforeEach(() => {
    jest.clearAllMocks();
    saved = undefined;
    listeners = new Set();
    write.mockImplementation(async (value) => {
      saved = value;
      for (const listener of listeners) listener();
    });
    client = {
      getCachedValue: jest.fn(() => saved) as PreferenceClient['getCachedValue'],
      getMultipleCached: jest.fn(),
      set: jest.fn(async (key, value) => {
        expect(key).toBe('chat.input.enter_to_send');
        await write(value as boolean);
      }),
      setMultiple: jest.fn(),
      subscribeChange: () => (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    act(() => {
      renderer = create(
        <PreferenceProvider preference={client}>
          <EnterToSendSetting />
        </PreferenceProvider>,
      );
    });
  });

  afterEach(() => act(() => renderer.unmount()));

  const control = () => renderer.root.findByType('SwitchItem' as never);

  it('defaults off and reads the saved preference after remounting', async () => {
    expect(control().props.value).toBe(false);
    await act(async () => control().props.onValueChange(true));
    expect(saved).toBe(true);
    expect(control().props.value).toBe(true);
    act(() => renderer.unmount());
    act(() => {
      renderer = create(
        <PreferenceProvider preference={client}>
          <EnterToSendSetting />
        </PreferenceProvider>,
      );
    });
    expect(control().props.value).toBe(true);
    await act(async () => control().props.onValueChange(false));
    expect(saved).toBe(false);
    expect(control().props.value).toBe(false);
  });

  it('retains the saved value and reports a failed write', async () => {
    await act(async () => control().props.onValueChange(true));
    write.mockRejectedValueOnce(new Error('storage unavailable'));
    await act(async () => control().props.onValueChange(false));
    expect(control().props.value).toBe(true);
    expect(control().props.disabled).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.enterToSend.saveFailed',
      variant: 'danger',
    });
  });

  it('disables changes while the write is pending', async () => {
    let finish!: () => void;
    write.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    act(() => control().props.onValueChange(true));
    expect(control().props.disabled).toBe(true);
    await act(async () => finish());
    expect(control().props.disabled).toBe(false);
  });
});
