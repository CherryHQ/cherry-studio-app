import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ModelSettingsScreen from '../ModelSettingsScreen';

const mockPush = jest.fn();
const mockGetModelItem = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const Section = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('Section', null, children);
  Section.Item = (props: object) => React.createElement('SectionItem', props);

  return { Section };
});

jest.mock('@/frontend/components/modelPicker', () => ({
  MODEL_SETTING_KINDS: ['default', 'fast', 'translate'],
  MODEL_SETTING_KIND_TITLE_KEYS: {
    default: 'settings.model.default.title',
    fast: 'settings.model.fast.title',
    translate: 'settings.model.translate.title',
  },
  useModelPickerData: () => ({ getModelItem: mockGetModelItem }),
  useModelSettingSelections: () => ({
    selections: { default: null, fast: null, translate: null },
  }),
}));

describe('ModelSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders model settings without emoji leading content', () => {
    act(() => {
      renderer = create(<ModelSettingsScreen />);
    });

    const items = renderer?.root.findAllByType('SectionItem') ?? [];

    expect(items.map((item) => item.props.label)).toEqual([
      'settings.model.default.title',
      'settings.model.fast.title',
      'settings.model.translate.title',
    ]);
    expect(items.every((item) => item.props.leading === undefined)).toBe(true);
  });
});
