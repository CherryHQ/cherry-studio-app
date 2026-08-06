import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchProviderSettingsScreen from '../WebSearchProviderScreen';

const mockRedirect = jest.fn((_props: object) => null);
const mockManagementSection = jest.fn((_props: object) => null);
const mockChrome = jest.fn((_props: object) => null);
const mockPush = jest.fn();
let mockProviderId = 'exa-mcp';

jest.mock('expo-router', () => ({
  Redirect: (props: object) => mockRedirect(props),
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('../../hooks/useWebSearchProviderPreferences', () => ({
  useWebSearchProviderPreferences: () => ({
    providerOverrides: {
      onCapabilityApiHostChange: jest.fn(),
      onProviderOverrideChange: jest.fn(),
      value: {},
    },
  }),
}));
jest.mock('../components/WebSearchApiManagementSection', () => ({
  WebSearchApiManagementSection: (props: object) => mockManagementSection(props),
}));
jest.mock('../components/WebSearchProviderChrome/WebSearchProviderChrome', () => ({
  WebSearchProviderChrome: (props: object) => mockChrome(props),
}));

describe('WebSearchProviderSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderId = 'exa-mcp';
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders settings for the supported Exa MCP provider', () => {
    act(() => {
      renderer = create(<WebSearchProviderSettingsScreen />);
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockManagementSection).toHaveBeenCalledWith(
      expect.objectContaining({ provider: expect.objectContaining({ id: 'exa-mcp' }) }),
    );
  });

  it('opens the independent check page from the bottom toolbar', () => {
    act(() => {
      renderer = create(<WebSearchProviderSettingsScreen />);
    });

    const [{ onCheck }] = mockChrome.mock.calls[0] as unknown as [{ onCheck: () => void }];
    act(() => onCheck());

    expect(mockPush).toHaveBeenCalledWith({
      params: { providerId: 'exa-mcp', providerName: 'ExaMCP' },
      pathname: '/settings/websearch/[providerId]/check',
    });
  });
});
