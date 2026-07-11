import { View } from 'react-native';
import { act, create } from 'react-test-renderer';

const mockCreateAssistant = jest.fn();
const mockLoadPresets = jest.fn();

jest.mock('@/hooks/chat/useAssistant', () => ({
  useAssistantMutations: () => ({ createAssistant: mockCreateAssistant }),
}));

jest.mock('@/data/presets/assistantCatalogService', () => {
  const actual = jest.requireActual('@/data/presets/assistantCatalogService');
  return {
    ...actual,
    loadAssistantCatalogPresets: mockLoadPresets,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => {
    const i18n = { language: 'en-US' };
    return { i18n, t: (key: string) => key };
  },
}));

const samplePresets: import('@/data/presets/assistantCatalogService').AssistantCatalogPreset[] = [
  {
    id: 'p1',
    name: 'Product Manager',
    group: ['Career', 'Business'],
    prompt: 'You are a PM.',
  },
  {
    id: 'p2',
    name: 'Writing Assistant',
    group: ['Writing'],
    prompt: 'You are a writer.',
  },
];

describe('useAssistantCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadPresets.mockReturnValue(samplePresets);
  });

  it('loads presets on mount when enabled', async () => {
    let _hookResult: any;

    function _TestComponent() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
      // biome-ignore lint/correctness/useHookAtTopLevel: intentional test pattern
      _hookResult = useAssistantCatalog({ enabled: true });
      return <View />;
    }

    await act(() => {
      create(<TestComponent />);
    });

    expect(mockLoadPresets).toHaveBeenCalledWith('en-US');
  });

  it('does not load presets when enabled is false', async () => {
    let _hookResult: any;

    function _TestComponent() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
      // biome-ignore lint/correctness/useHookAtTopLevel: intentional test pattern
      _hookResult = useAssistantCatalog({ enabled: false });
      return <View />;
    }

    await act(() => {
      create(<TestComponent />);
    });

    expect(mockLoadPresets).not.toHaveBeenCalled();
  });

  it('provides isLoading initially and false after load', async () => {
    let hookResult: any;

    function _TestComponent() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
      // biome-ignore lint/correctness/useHookAtTopLevel: intentional test pattern
      hookResult = useAssistantCatalog({ enabled: true });
      return <View />;
    }

    await act(() => {
      create(<TestComponent />);
    });

    // After queueMicrotask resolves, isLoading should be false
    expect(hookResult.isLoading).toBe(false);
    expect(hookResult.presets).toEqual(samplePresets);
  });

  it('returns tabs and filtered presets', async () => {
    let hookResult: any;

    function _TestComponent() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
      // biome-ignore lint/correctness/useHookAtTopLevel: intentional test pattern
      hookResult = useAssistantCatalog({ enabled: true });
      return <View />;
    }

    await act(() => {
      create(<TestComponent />);
    });

    const tabs = hookResult.getTabs('All');
    expect(tabs[0]).toEqual({ id: '__all__', label: 'All', count: 2 });

    const filtered = hookResult.filterPresets('Career', '');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('p1');
  });

  it('calls createAssistant via addPreset', async () => {
    mockCreateAssistant.mockResolvedValue({ id: 'new-id' });
    let hookResult: any;

    function _TestComponent() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
      // biome-ignore lint/correctness/useHookAtTopLevel: intentional test pattern
      hookResult = useAssistantCatalog({ enabled: true });
      return <View />;
    }

    await act(() => {
      create(<TestComponent />);
    });

    await act(async () => {
      await hookResult.addPreset(samplePresets[0]);
    });

    expect(mockCreateAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Product Manager' }),
    );
  });
});
