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

jest.mock('heroui-native/slider', () => {
  const { createElement } = jest.requireActual('react');

  const Slider = ({ children, ...props }: { children: React.ReactNode }) =>
    createElement('Slider', props, children);
  Slider.Track = ({ children }: { children: React.ReactNode }) =>
    createElement('SliderTrack', null, children);
  Slider.Fill = () => createElement('SliderFill');
  Slider.Thumb = () => createElement('SliderThumb');

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

  test('previews changes immediately and persists at interaction end', async () => {
    const slider = renderer?.root.findByType('Slider');

    act(() => slider?.props.onChange(2));

    expect(mockApplyFontSizeStep).toHaveBeenLastCalledWith(2);
    expect(renderer?.root.findByType('MarkdownText').props.fontSizeStep).toBe(2);
    expect(mockSetStoredStep).not.toHaveBeenCalled();

    await act(async () => slider?.props.onChangeEnd(2));

    expect(mockSetStoredStep).toHaveBeenCalledWith(2, { optimistic: true });
  });

  test('restores the stored step when persistence fails', async () => {
    mockSetStoredStep.mockRejectedValueOnce(new Error('write failed'));
    const slider = renderer?.root.findByType('Slider');

    act(() => slider?.props.onChange(2));
    await act(async () => {
      slider?.props.onChangeEnd(2);
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
