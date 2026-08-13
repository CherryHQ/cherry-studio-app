import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import NewProviderScreen from '../NewProviderScreen';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-id') }));
jest.mock('expo-image-picker', () => ({}));

jest.mock('@cherrystudio/app-icons', () => ({
  ImageUpIcon: () => null,
  RotateCcwIcon: () => null,
}));

jest.mock('react-native-keyboard-controller', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    KeyboardAwareScrollView: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');

  return {
    Button: (props: { children?: ReactNode }) => <MockPressable {...props} />,
    Input: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    Label: (props: { children?: ReactNode }) => <MockText {...props} />,
    Menu: ({ children }: { children?: ReactNode }) => <MockView>{children}</MockView>,
    SecureInput: (props: Record<string, unknown>) => (
      <MockTextInput {...props} mockComponent="secure-input" />
    ),
    TextField: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
  };
});

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));

jest.mock('@/frontend/components/headers', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { BackHeader: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('@/frontend/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ persistAvatar: jest.fn() }),
  useMutation: () => ({ isLoading: false, trigger: jest.fn() }),
}));

jest.mock('../apiService', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ProviderDefaultEndpointControl: (props: Record<string, unknown>) => <MockView {...props} />,
  };
});

describe('NewProviderScreen API key field', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses SecureInput for the normalized API key value', () => {
    act(() => {
      renderer = create(<NewProviderScreen />);
    });

    const input = renderer!.root.findByProps({ mockComponent: 'secure-input' });

    expect(input.props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'settings.provider.apiService.apiKey',
        value: '',
        visibilityAccessibilityLabels: {
          hide: 'settings.provider.apiService.hideApiKeys',
          show: 'settings.provider.apiService.showApiKeys',
        },
      }),
    );

    act(() => input.props.onChangeText('first\nsecond'));

    expect(renderer!.root.findByProps({ mockComponent: 'secure-input' }).props.value).toBe(
      'firstsecond',
    );
  });
});
