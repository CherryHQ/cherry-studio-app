import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchCompressionMethodScreen from '../WebSearchCompressionMethodScreen';
import WebSearchDefaultProviderScreen from '../WebSearchDefaultProviderScreen';
import WebSearchFetchProviderScreen from '../WebSearchFetchProviderScreen';

const mockCompressionChange = jest.fn();
const mockProviderChange = jest.fn();
const mockFetchProviderChange = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));
jest.mock('lucide-uniwind/png', () => ({ CheckIcon: () => null }));
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
    compressionMethod: {
      onValueChange: mockCompressionChange,
      options: [
        { label: 'None', value: 'none' },
        { label: 'Cutoff', value: 'cutoff' },
      ],
      value: 'none',
    },
    fetchUrls: {
      onValueChange: mockFetchProviderChange,
      options: [
        { label: 'Jina', value: 'jina' },
        { label: 'Firecrawl', value: 'firecrawl' },
      ],
      value: 'jina',
    },
    searchKeywords: {
      onValueChange: mockProviderChange,
      options: [
        { label: 'Tavily', value: 'tavily' },
        { label: 'Exa', value: 'exa' },
      ],
      value: 'tavily',
    },
  }),
}));
jest.mock('../utils/providerIcons', () => ({ resolveWebSearchProviderIcon: () => undefined }));

describe('Web Search selection screens', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  test('selects the default provider', () => {
    act(() => {
      renderer = create(<WebSearchDefaultProviderScreen />);
    });

    const rows = renderer!.root.findAllByType('SectionItem');
    act(() => rows[1].props.onPress());
    expect(mockProviderChange).toHaveBeenCalledWith('exa');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('selects the compression method', () => {
    act(() => {
      renderer = create(<WebSearchCompressionMethodScreen />);
    });

    const rows = renderer!.root.findAllByType('SectionItem');
    act(() => rows[1].props.onPress());
    expect(mockCompressionChange).toHaveBeenCalledWith('cutoff');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('selects Jina or Firecrawl for URL fetching', () => {
    act(() => {
      renderer = create(<WebSearchFetchProviderScreen />);
    });

    const rows = renderer!.root.findAllByType('SectionItem');
    expect(rows.map((row) => row.props.label)).toEqual(['Jina', 'Firecrawl']);
    act(() => rows[1].props.onPress());
    expect(mockFetchProviderChange).toHaveBeenCalledWith('firecrawl');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
