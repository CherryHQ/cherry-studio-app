import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import WebSearchCheckScreen from '../WebSearchCheckScreen';

const mockCheckProvider = jest.fn(
  async (): Promise<{ error?: string; valid: boolean }> => ({ valid: true }),
);
const mockAlertShow = jest.fn();
const mockToastShow = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ providerId: 'exa' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { index?: number; key?: string }) =>
      params?.key ? `${key}:${params.index}:${params.key}` : key,
  }),
}));

jest.mock('lucide-uniwind/png', () => ({
  ChevronDownIcon: () => null,
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));
jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('@/frontend/components/selectionSheet', () => {
  const { createElement } = jest.requireActual('react');
  return {
    SingleSelectionSheet: (props: object) => createElement('SingleSelectionSheet', props),
  };
});

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ checkProvider: mockCheckProvider }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);
  return { Button, Section };
});

jest.mock('../../hooks/useWebSearchProviderPreferences', () => ({
  useWebSearchProviderPreferences: () => ({
    providerOverrides: {
      value: {
        exa: { apiKeys: ['sk-test-12345678'] },
      },
    },
  }),
}));

describe('WebSearchCheckScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckProvider.mockResolvedValue({ valid: true });
    act(() => {
      renderer = create(<WebSearchCheckScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('checks the selected API key and keeps the result on the page', async () => {
    const button = renderer!.root.findByType('Button');
    const sheet = renderer!.root.findByType('SingleSelectionSheet');

    expect(sheet.props.heightFraction).toBe(0.6);

    await act(async () => button.props.onPress());

    expect(mockCheckProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ apiKeys: ['sk-test-12345678'], id: 'exa' }),
      }),
    );
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.websearch.provider.checkSuccess',
      variant: 'success',
    });
    expect(
      renderer!.root.findAll(
        (node) => node.props.children === 'settings.websearch.provider.checkSuccess',
      ),
    ).not.toHaveLength(0);
  });

  test('shows the check error in an alert instead of a toast', async () => {
    mockCheckProvider.mockResolvedValue({ error: 'Invalid API key', valid: false });
    const button = renderer!.root.findByType('Button');

    await act(async () => button.props.onPress());

    expect(mockAlertShow).toHaveBeenCalledWith({
      description: 'Invalid API key',
      title: 'settings.websearch.provider.checkFailed',
    });
    expect(mockToastShow).not.toHaveBeenCalled();
    expect(
      renderer!.root.findAll((node) => node.props.children === 'Invalid API key'),
    ).toHaveLength(0);
  });
});
