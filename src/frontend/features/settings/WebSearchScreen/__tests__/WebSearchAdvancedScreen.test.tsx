import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchAdvancedScreen from '../WebSearchAdvancedScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@cherrystudio/app-icons', () => ({ ChevronRightIcon: () => null }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);
  return { Section };
});
jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('../../components/SettingNumberInput', () => ({ SettingNumberInput: () => null }));
jest.mock('../../hooks/useWebSearchProviderPreferences', () => ({
  useWebSearchProviderPreferences: () => ({
    compressionCutoffLimit: { onValueChange: jest.fn(), value: 2000 },
    compressionMethod: {
      onValueChange: jest.fn(),
      options: [
        { label: 'None', value: 'none' },
        { label: 'Cutoff', value: 'cutoff' },
      ],
      value: 'none',
    },
    maxResults: { onValueChange: jest.fn(), value: 5 },
  }),
}));

describe('WebSearchAdvancedScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<WebSearchAdvancedScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('opens compression selection without showing the blacklist', () => {
    const compressionRow = renderer!.root
      .findAllByType('SectionItem')
      .find((row) => row.props.label === 'settings.websearch.compressionMethod');
    act(() => compressionRow?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/websearch/compression-method');
    expect(
      renderer!.root
        .findAllByType('SectionItem')
        .some((row) => row.props.label === 'settings.websearch.excludeDomains'),
    ).toBe(false);
  });
});
