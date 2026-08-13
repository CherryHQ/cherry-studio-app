import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import LanguageSettingsScreen from '../LanguageSettingsScreen';

const mockLanguageChange = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
}));

jest.mock('@/frontend/components/headers', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackHeader: (props: object) => createElement('BackHeader', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);

  return { Section };
});

jest.mock('../hooks/useSettingPreferences', () => ({
  useSettingPreferences: () => ({
    language: {
      onValueChange: mockLanguageChange,
      options: [
        { label: '简体中文', value: 'zh-CN' },
        { label: 'English', value: 'en-US' },
      ],
      value: 'zh-CN',
    },
  }),
}));

describe('LanguageSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<LanguageSettingsScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('shows the current language as a selected radio option', () => {
    const header = renderer?.root.findByType('BackHeader');
    const items = renderer?.root.findAllByType('SectionItem') ?? [];

    expect(header?.props.title).toBe('settings.items.appLanguage');
    expect(items.map((item) => item.props.label)).toEqual(['简体中文', 'English']);
    expect(items[0].props.accessibilityRole).toBe('radio');
    expect(items[0].props.accessibilityState).toEqual({ checked: true });
    expect(items[1].props.accessibilityState).toEqual({ checked: false });
  });

  test('updates the language without navigating back', () => {
    const items = renderer?.root.findAllByType('SectionItem') ?? [];

    act(() => items[1].props.onPress());

    expect(mockLanguageChange).toHaveBeenCalledWith('en-US');
  });
});
