import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AppearanceSettingsScreen from '../AppearanceSettingsScreen';

const mockPush = jest.fn();
const mockThemeChange = jest.fn();
const mockLanguageChange = jest.fn();
let mockResolvedTheme = 'dark';
let mockThemeMode = 'system';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('uniwind', () => {
  const { createElement } = jest.requireActual('react');
  return {
    // Rendered as a host element rather than a passthrough so the two theme
    // previews stay distinguishable in the tree — the scope is the only thing
    // that differs between them now that both draw from the same class names.
    ScopedTheme: (props: object) => createElement('ScopedTheme', props),
    useResolveClassNames: () => ({}),
    useUniwind: () => ({ theme: mockResolvedTheme }),
  };
});

jest.mock('lucide-uniwind/png', () => ({
  ALargeSmallIcon: () => null,
  CheckIcon: () => null,
  ChevronRightIcon: () => null,
  GlobeIcon: () => null,
}));

jest.mock('@/frontend/components/headers', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackHeader: (props: object) => createElement('BackHeader', props),
  };
});

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [2, jest.fn()],
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = ({ children, ...props }: { children?: React.ReactNode }) =>
    createElement('SectionItem', props, children);

  return {
    Section,
    Switch: (props: object) => createElement('Switch', props),
  };
});

jest.mock('../hooks/useSettingPreferences', () => ({
  useSettingPreferences: () => ({
    language: {
      onValueChange: mockLanguageChange,
      options: [{ label: 'English', value: 'en-US' }],
      value: 'en-US',
    },
    theme: {
      onValueChange: mockThemeChange,
      value: mockThemeMode,
    },
  }),
}));

describe('AppearanceSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvedTheme = 'dark';
    mockThemeMode = 'system';
  });

  test('separates theme previews from language and font size settings', () => {
    const renderer = render(<AppearanceSettingsScreen />);
    const header = renderer.root.findByType('BackHeader');
    const sections = renderer.root.findAllByType('Section');
    const items = renderer.root.findAllByType('SectionItem');

    expect(header.props.title).toBe('settings.appearance.title');
    expect(sections).toHaveLength(2);
    expect(sections[0].props.title).toBe('settings.items.theme');
    expect(sections[1].props.title).toBeUndefined();
    expect(items[0].props.testID).toBe('theme-preview-section-item');
    expect(items.slice(1).map((item) => item.props.label)).toEqual([
      'settings.items.appLanguage',
      'settings.items.fontSize',
    ]);
    expect(items[1].props.trailing.props.children[0].props.children).toBe('English');
  });

  test('shows the resolved system theme and switches between automatic and manual modes', () => {
    const renderer = render(<AppearanceSettingsScreen />);
    const lightPreview = renderer.root.find(
      (node) =>
        node.props.testID === 'theme-preview-light' && typeof node.props.onPress === 'function',
    );
    const darkPreview = renderer.root.find(
      (node) =>
        node.props.testID === 'theme-preview-dark' && typeof node.props.onPress === 'function',
    );
    const automaticSwitch = renderer.root.findByType('Switch');

    expect(lightPreview.props.accessibilityState).toEqual({ checked: false });
    expect(darkPreview.props.accessibilityState).toEqual({ checked: true });
    expect(automaticSwitch.props.value).toBe(true);

    act(() => lightPreview.props.onPress());
    act(() => automaticSwitch.props.onValueChange(false));
    act(() => automaticSwitch.props.onValueChange(true));

    expect(mockThemeChange.mock.calls).toEqual([['light'], ['dark'], ['system']]);
  });

  test('opens the language and font size detail screens', () => {
    const renderer = render(<AppearanceSettingsScreen />);
    const items = renderer.root.findAllByType('SectionItem');

    act(() => items[1].props.onPress());
    act(() => items[2].props.onPress());

    expect(mockPush).toHaveBeenCalledWith('/settings/language');
    expect(mockPush).toHaveBeenCalledWith('/settings/font-size');
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}
