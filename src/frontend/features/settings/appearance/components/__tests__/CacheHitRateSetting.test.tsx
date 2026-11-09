import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceDefaults } from '@/shared/data/preference';

import { CacheHitRateSetting } from '../CacheHitRateSetting';

let mockIsCacheHitRateEnabled = true;
const mockSetCacheHitRateEnabled = jest.fn<Promise<void>, [boolean]>();
const mockToastShow = jest.fn();

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) => {
    if (key !== 'chat.cache_hit_rate.enabled') throw new Error(`Unexpected preference: ${key}`);
    return [mockIsCacheHitRateEnabled, mockSetCacheHitRateEnabled];
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Section: {
      SwitchItem: (props: object) => React.createElement('SwitchItem', props),
    },
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

describe('CacheHitRateSetting', () => {
  let renderer: ReactTestRenderer | undefined;
  const switchItem = () => renderer!.root.findByType('SwitchItem' as never);
  const mount = () => {
    act(() => {
      renderer = create(<CacheHitRateSetting />);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsCacheHitRateEnabled = PreferenceDefaults['chat.cache_hit_rate.enabled'];
    mockSetCacheHitRateEnabled.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the saved value and saves both switch values', async () => {
    mount();
    expect(switchItem().props.testID).toBe('settings-cache-hit-rate');
    expect(switchItem().props.value).toBe(false);

    await act(async () => switchItem().props.onValueChange(true));
    expect(mockSetCacheHitRateEnabled).toHaveBeenLastCalledWith(true);
    mockIsCacheHitRateEnabled = true;
    act(() => renderer!.update(<CacheHitRateSetting />));
    expect(switchItem().props.value).toBe(true);

    await act(async () => switchItem().props.onValueChange(false));
    expect(mockSetCacheHitRateEnabled).toHaveBeenLastCalledWith(false);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('disables the switch until the preference write finishes', async () => {
    let finishSave!: () => void;
    mockSetCacheHitRateEnabled.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    mount();
    act(() => switchItem().props.onValueChange(true));
    expect(switchItem().props.disabled).toBe(true);

    await act(async () => finishSave());
    expect(switchItem().props.disabled).toBe(false);
  });

  test('keeps the saved value and shows a translated error when saving fails', async () => {
    mockIsCacheHitRateEnabled = true;
    mockSetCacheHitRateEnabled.mockRejectedValueOnce(new Error('write failed'));
    mount();

    await act(async () => switchItem().props.onValueChange(false));

    expect(switchItem().props.value).toBe(true);
    expect(switchItem().props.disabled).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.cacheHitRate.saveFailed',
      variant: 'danger',
    });
  });
});
