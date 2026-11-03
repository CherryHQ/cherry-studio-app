import type { PropsWithChildren } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceDefaults } from '@/shared/data/preference';

import ChatSettingsScreen from '../ChatSettingsScreen';

let mockIsAutoCollapseEnabled = false;
const mockSetAutoCollapseEnabled = jest.fn<Promise<void>, [boolean]>();
const mockToastShow = jest.fn();

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) => {
    if (key !== 'chat.reasoning.auto_collapse') throw new Error(`Unexpected preference: ${key}`);
    return [mockIsAutoCollapseEnabled, mockSetAutoCollapseEnabled];
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Section: Object.assign(({ children }: PropsWithChildren) => children, {
      SwitchItem: (props: object) => React.createElement('SwitchItem', props),
    }),
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

jest.mock('../../components/SettingsScrollPage', () => ({
  SettingsScrollPage: ({ children }: PropsWithChildren) => children,
}));

describe('ChatSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;
  const switchItem = () => renderer!.root.findByType('SwitchItem' as never);
  const mount = () => {
    act(() => {
      renderer = create(<ChatSettingsScreen />);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutoCollapseEnabled = PreferenceDefaults['chat.reasoning.auto_collapse'];
    mockSetAutoCollapseEnabled.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('starts off by default and saves both switch values', async () => {
    mount();
    expect(switchItem().props.testID).toBe('settings-auto-collapse-reasoning');
    expect(switchItem().props.value).toBe(false);

    await act(async () => switchItem().props.onValueChange(true));
    expect(mockSetAutoCollapseEnabled).toHaveBeenLastCalledWith(true);
    mockIsAutoCollapseEnabled = true;
    act(() => renderer!.update(<ChatSettingsScreen />));
    expect(switchItem().props.value).toBe(true);

    await act(async () => switchItem().props.onValueChange(false));
    expect(mockSetAutoCollapseEnabled).toHaveBeenLastCalledWith(false);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('disables the switch until the preference write finishes', async () => {
    let finishSave!: () => void;
    mockSetAutoCollapseEnabled.mockReturnValueOnce(
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
    mockIsAutoCollapseEnabled = true;
    mockSetAutoCollapseEnabled.mockRejectedValueOnce(new Error('write failed'));
    mount();

    await act(async () => switchItem().props.onValueChange(false));

    expect(switchItem().props.value).toBe(true);
    expect(switchItem().props.disabled).toBe(false);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.autoCollapseReasoning.saveFailed',
      variant: 'danger',
    });
  });
});
