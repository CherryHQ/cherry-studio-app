import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import BuiltInToolsSettingsScreen from '../BuiltInToolsSettingsScreen';

const mockSetPreference = jest.fn(async () => undefined);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/headers', () => {
  const React = jest.requireActual('react');
  return { BackHeader: (props: object) => React.createElement('BackHeader', props) };
});

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [true, mockSetPreference],
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  function Section(props: object) {
    return React.createElement('Section', props);
  }
  function SectionItem({ trailing, ...props }: { trailing?: React.ReactNode }) {
    return React.createElement('SectionItem', props, trailing);
  }
  function Switch(props: object) {
    return React.createElement('Switch', props);
  }
  Section.Item = SectionItem;
  return { Section, Switch };
});

describe('BuiltInToolsSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  test('binds the provider configuration tools to one enabled-by-default switch', async () => {
    act(() => {
      renderer = create(<BuiltInToolsSettingsScreen />);
    });

    const toggle = renderer!.root.findByType('Switch');
    expect(toggle.props.value).toBe(true);
    expect(toggle.props.accessibilityLabel).toBe('settings.builtInTools.providerConfiguration');

    await act(async () => toggle.props.onValueChange(false));
    expect(mockSetPreference).toHaveBeenCalledWith(false);
  });
});
