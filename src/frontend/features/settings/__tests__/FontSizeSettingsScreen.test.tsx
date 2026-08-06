import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import FontSizeSettingsScreen from '../FontSizeSettingsScreen';

const mockApplyFontSizeStep = jest.fn();
const mockSetStoredStep = jest.fn(async () => undefined);
const mockToastShow = jest.fn();

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@/frontend/components/markdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MarkdownText: (props: object) => createElement('MarkdownText', props),
  };
});

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [0, mockSetStoredStep],
}));

jest.mock('@/frontend/utils/theme', () => ({
  applyFontSizeStepPreference: (step: number) => mockApplyFontSizeStep(step),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');

  const Slider = (props: object) => createElement('Slider', props);

  return { Slider };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('FontSizeSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetStoredStep.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<FontSizeSettingsScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('previews and persists changes immediately', () => {
    const slider = renderer?.root.findByType('Slider');

    expect(slider?.props.minimumValueLabel).toBe('settings.fontSize.level.standard');
    expect(slider?.props.maximumValueLabel).toBe('settings.fontSize.level.extraLarge');

    act(() => slider?.props.onValueChange(2));

    expect(mockApplyFontSizeStep).toHaveBeenLastCalledWith(2);
    expect(renderer?.root.findByType('MarkdownText').props.fontSizeStep).toBe(2);
    expect(mockSetStoredStep).toHaveBeenCalledWith(2, { optimistic: true });
  });

  test('restores the stored step when persistence fails', async () => {
    mockSetStoredStep.mockRejectedValueOnce(new Error('write failed'));
    const slider = renderer?.root.findByType('Slider');

    await act(async () => {
      slider?.props.onValueChange(2);
      await Promise.resolve();
    });

    expect(mockApplyFontSizeStep).toHaveBeenLastCalledWith(0);
    expect(renderer?.root.findByType('MarkdownText').props.fontSizeStep).toBe(0);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.fontSize.saveFailed',
      variant: 'danger',
    });
  });
});
