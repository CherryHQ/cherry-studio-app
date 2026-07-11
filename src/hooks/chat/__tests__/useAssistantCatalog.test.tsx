import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { AssistantCatalogPreset } from '@/data/presets/assistantCatalogService';
import type { UseAssistantCatalogReturn } from '@/hooks/chat/useAssistantCatalog';

const mockCreateAssistant = jest.fn();
const mockLoadPresets = jest.fn();
const mockT = (key: string) => key;
let mockLanguage = 'en-US';

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

jest.mock('react-i18next', () => {
  return {
    useTranslation: () => {
      return { i18n: { language: mockLanguage }, t: mockT };
    },
  };
});

const samplePresets: AssistantCatalogPreset[] = [
  { id: 'p1', name: 'Product Manager', group: ['Career', 'Business'], prompt: 'You are a PM.' },
  { id: 'p2', name: 'Writing Assistant', group: ['Writing'], prompt: 'You are a writer.' },
];

describe('useAssistantCatalog', () => {
  let hookResult: UseAssistantCatalogReturn | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadPresets.mockReturnValue(samplePresets);
    hookResult = undefined;
  });

  function TestComponent({ enabled = true }: { enabled?: boolean }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAssistantCatalog } = require('@/hooks/chat/useAssistantCatalog');
    hookResult = useAssistantCatalog({ enabled });
    return <View />;
  }

  async function renderHook(enabled = true) {
    await act(() => {
      create(<TestComponent enabled={enabled} />);
    });
    if (!hookResult) throw new Error('hookResult not set');
    return hookResult;
  }

  it('loads presets on mount when enabled', async () => {
    await renderHook(true);
    expect(mockLoadPresets).toHaveBeenCalledWith('en-US');
  });

  it('does not load presets when enabled is false', async () => {
    await renderHook(false);
    expect(mockLoadPresets).not.toHaveBeenCalled();
  });

  it('returns isLoading as false after mount', async () => {
    const result = await renderHook(true);
    // Synchronous load — isLoading is always false
    expect(result.isLoading).toBe(false);
    expect(result.presets).toEqual(samplePresets);
  });

  it('returns tabs and filtered presets', async () => {
    const result = await renderHook(true);
    const tabs = result.getTabs('All');
    expect(tabs[0]).toEqual({ id: '__all__', label: 'All', count: 2 });

    const filtered = result.filterPresets('Career', '');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('p1');
  });

  it('calls createAssistant via addPreset', async () => {
    mockCreateAssistant.mockResolvedValue({ id: 'new-id' });
    const result = await renderHook(true);

    await act(async () => {
      await result.addPreset(samplePresets[0]);
    });

    expect(mockCreateAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Product Manager' }),
    );
  });

  it('handles addPreset error without unhandled rejection', async () => {
    mockCreateAssistant.mockRejectedValue(new Error('API failure'));
    const result = await renderHook(true);

    await act(async () => {
      await expect(result.addPreset(samplePresets[0])).rejects.toThrow('API failure');
    });
  });

  it('reloads presets when language changes', async () => {
    await renderHook(true);
    expect(mockLoadPresets).toHaveBeenLastCalledWith('en-US');

    mockLoadPresets.mockClear();
    mockLanguage = 'zh-CN';

    // Trigger a re-render by changing the language mock — the effect depends on
    // i18n.language which we control via the mutable mockLanguage variable.
    // Re-creating the component lets the mock pick up the new value.
    mockLoadPresets.mockReturnValue(samplePresets);
    await renderHook(true);

    expect(mockLoadPresets).toHaveBeenCalledWith('zh-CN');
  });
});
