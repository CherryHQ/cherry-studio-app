import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import SettingsScreen from '../SettingsScreen';

const mockAlertShow = jest.fn();
const mockSetBackgroundReplyEnabled = jest.fn(async () => undefined);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);

  return {
    Section,
    Switch: (props: object) => createElement('Switch', props),
  };
});

jest.mock('@cherrystudio/ui/icons', () => ({ resolveProviderIcon: () => undefined }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('lucide-uniwind/png', () => ({
  CircleUserRoundIcon: () => null,
  CloudIcon: () => null,
  DatabaseIcon: () => null,
  EarthIcon: () => null,
  InfoIcon: () => null,
  RadioIcon: () => null,
  ShieldCheckIcon: () => null,
  SparklesIcon: () => null,
  SunIcon: () => null,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-bottom-tabs', () => ({ useBottomTabBarHeight: () => 48 }));
jest.mock('react-native-reanimated', () => {
  const { createElement } = jest.requireActual('react');
  return {
    __esModule: true,
    default: { ScrollView: (props: object) => createElement('ScrollView', props) },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));
jest.mock('@/frontend/components/nativePrimitives', () => ({ Image: () => null }));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) =>
    key === 'app.user.name' ? ['Tester', jest.fn()] : [true, mockSetBackgroundReplyEnabled],
}));
jest.mock('../profileHero', () => ({
  ProfileHero: () => null,
  ProfileStickyBar: () => null,
  useProfileHeaderAnimation: () => ({
    lockProgress: { value: 0 },
    onScroll: jest.fn(),
    scrollY: { value: 0 },
    toggleHeroLock: jest.fn(),
  }),
}));

describe('SettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetBackgroundReplyEnabled.mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    act(() => {
      renderer = create(<SettingsScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('reports a background reply preference write failure', async () => {
    mockSetBackgroundReplyEnabled.mockRejectedValueOnce(new Error('write failed'));
    const backgroundReplyItem = renderer?.root
      .findAllByType('SectionItem')
      .find((item) => item.props.label === 'settings.items.backgroundReply');
    const backgroundReplySwitch = backgroundReplyItem?.props.trailing;

    await act(async () => {
      backgroundReplySwitch?.props.onValueChange(false);
      await Promise.resolve();
    });

    expect(mockSetBackgroundReplyEnabled).toHaveBeenCalledWith(false);
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'settings.backgroundReply.saveFailed',
    });
  });
});
