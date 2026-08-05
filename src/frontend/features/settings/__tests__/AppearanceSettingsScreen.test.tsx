import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AppearanceSettingsScreen from '../AppearanceSettingsScreen';

const mockPush = jest.fn();
const mockThemeChange = jest.fn();
const mockLanguageChange = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

jest.mock('../components/SettingSelect', () => {
  const { createElement } = jest.requireActual('react');
  return {
    SettingSelect: (props: object) => createElement('SettingSelect', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);

  return {
    Section,
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
      options: [{ label: 'System', value: 'system' }],
      value: 'system',
    },
  }),
}));

describe('AppearanceSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows theme, language, and font size settings', () => {
    const renderer = render(<AppearanceSettingsScreen />);
    const header = renderer.root.findByType('BackHeader');
    const items = renderer.root.findAllByType('SectionItem');

    expect(header.props.title).toBe('settings.appearance.title');
    expect(items.map((item) => item.props.label)).toEqual([
      'settings.items.theme',
      'settings.items.appLanguage',
      'settings.items.fontSize',
    ]);
    expect(items[0].props.trailing.props).toEqual(
      expect.objectContaining({
        label: 'settings.items.theme',
        onValueChange: mockThemeChange,
        value: 'system',
      }),
    );
    expect(items[1].props.trailing.props).toEqual(
      expect.objectContaining({
        label: 'settings.items.appLanguage',
        onValueChange: mockLanguageChange,
        value: 'en-US',
      }),
    );
  });

  test('opens the existing font size detail screen', () => {
    const renderer = render(<AppearanceSettingsScreen />);
    const items = renderer.root.findAllByType('SectionItem');

    act(() => items[2].props.onPress());

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
