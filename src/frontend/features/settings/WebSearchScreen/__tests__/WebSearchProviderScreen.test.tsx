import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchProviderSettingsScreen from '../WebSearchProviderScreen';

const mockRedirect = jest.fn((_props: object) => null);
const mockManagementSection = jest.fn((_props: object) => null);
let mockProviderId = 'exa-mcp';

jest.mock('expo-router', () => ({
  Redirect: (props: object) => mockRedirect(props),
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
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
});
