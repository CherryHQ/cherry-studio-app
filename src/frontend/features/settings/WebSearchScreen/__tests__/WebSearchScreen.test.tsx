import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchSettingsScreen from '../WebSearchScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));

jest.mock('lucide-uniwind/png', () => ({ ChevronRightIcon: () => null }));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);
  return { Section };
});

jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('@/frontend/components/nativePrimitives', () => ({ Image: () => null }));
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
    searchKeywords: {
      onValueChange: jest.fn(),
      options: [
        { label: 'Tavily', value: 'tavily' },
        { label: 'Exa', value: 'exa' },
      ],
      value: 'tavily',
    },
  }),
}));

jest.mock('../utils/providerIcons', () => ({ resolveWebSearchProviderIcon: () => undefined }));

describe('WebSearchSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<WebSearchSettingsScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('opens dedicated screens for provider and compression selection', () => {
    const rows = renderer!.root.findAllByType('SectionItem');
    const providerRow = rows.find(
      (row) => row.props.label === 'settings.websearch.defaultProvider',
    );
    const compressionRow = rows.find(
      (row) => row.props.label === 'settings.websearch.compressionMethod',
    );

    act(() => providerRow?.props.onPress());
    act(() => compressionRow?.props.onPress());

    expect(mockPush).toHaveBeenNthCalledWith(1, '/settings/websearch/default-provider');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/settings/websearch/compression-method');
  });
});
