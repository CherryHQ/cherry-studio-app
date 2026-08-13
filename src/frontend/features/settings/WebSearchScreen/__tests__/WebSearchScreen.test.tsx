import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchSettingsScreen from '../WebSearchScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
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
jest.mock('../../hooks/useWebSearchProviderPreferences', () => ({
  useWebSearchProviderPreferences: () => ({
    providerOverrides: {
      onCapabilityApiHostChange: jest.fn(),
      onProviderOverrideChange: jest.fn(),
      value: { tavily: { apiKeys: ['test-key'] } },
    },
    fetchUrls: { value: 'jina' },
    searchKeywords: { value: 'tavily' },
  }),
}));
jest.mock('../components/WebSearchApiManagementSection', () => {
  const { createElement } = jest.requireActual('react');
  return {
    WebSearchApiManagementSection: ({ afterItems, children, ...props }: any) =>
      createElement('WebSearchApiManagementSection', props, children, afterItems),
  };
});
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

  test('opens provider, advanced, and URL fetch provider screens', () => {
    const rows = renderer!.root.findAllByType('SectionItem');
    const providerRow = rows.find(
      (row) => row.props.label === 'settings.websearch.provider.selection',
    );
    const advancedRow = rows.find((row) => row.props.label === 'settings.websearch.advanced.title');
    const fetchProviderRow = rows.find(
      (row) => row.props.label === 'settings.websearch.fetchUrlsProvider',
    );

    act(() => providerRow?.props.onPress());
    act(() => advancedRow?.props.onPress());
    act(() => fetchProviderRow?.props.onPress());

    expect(mockPush).toHaveBeenNthCalledWith(1, '/settings/websearch/default-provider');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/settings/websearch/advanced');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/settings/websearch/fetch-provider');
  });
});
