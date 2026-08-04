import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageRankingItem } from '../../types';
import { AiUsageRankingList } from '../AiUsageRankingList';

const mockResolveProviderIcon = jest.fn((_providerId: string) => undefined);

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveIcon: () => undefined,
  resolveProviderIcon: (providerId: string) => mockResolveProviderIcon(providerId),
}));
jest.mock('lucide-uniwind/png', () => ({ ChevronDownIcon: () => null, EllipsisIcon: () => null }));
jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({}),
  useUniwind: () => ({ theme: 'light' }),
  withUniwind: (component: unknown) => component,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { tokens?: string }) =>
      ({
        'aiUsage.otherModels': 'Other models',
        'aiUsage.otherProviders': 'Other providers',
        'aiUsage.showMore': 'Show more',
        'aiUsage.tokensValue': `${options?.tokens} Tokens`,
        'aiUsage.unknownModel': 'Unknown model',
        'aiUsage.unknownProvider': 'Unknown provider',
      })[key] ?? key,
  }),
}));

const modelItems: AiUsageRankingItem[] = Array.from({ length: 15 }, (_, index) => ({
  groupBy: 'model',
  isOther: false,
  key: `model-${index}`,
  modelId: `provider::model-${index}`,
  providerId: 'provider',
  providerName: 'Provider',
  totalTokens: 1_000 - index * 10,
}));

describe('AiUsageRankingList', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('uses desktop model labels and reveals seven more rows per press', async () => {
    await renderList(modelItems);

    expect(rankingRows()).toHaveLength(7);
    expect(textValues()).toEqual(expect.arrayContaining(['model-0 | Provider', '1K Tokens']));
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-ranking-progress-0' }).props.className,
    ).toBe('h-1 min-w-1 rounded-full bg-primary');

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-show-more' }).props.onPress(),
    );
    expect(rankingRows()).toHaveLength(14);

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-show-more' }).props.onPress(),
    );
    expect(rankingRows()).toHaveLength(15);
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-show-more' })).toHaveLength(0);
  });

  it('uses provider names and provider icons in provider mode', async () => {
    const providerItems: AiUsageRankingItem[] = [
      {
        groupBy: 'provider',
        isOther: false,
        key: 'provider:openai',
        modelId: null,
        providerId: 'openai',
        providerName: 'OpenAI',
        totalTokens: 2_400,
      },
      {
        groupBy: 'provider',
        isOther: true,
        key: 'other:provider',
        modelId: null,
        providerId: null,
        providerName: null,
        totalTokens: 100,
      },
    ];

    await renderList(providerItems);

    expect(textValues()).toEqual(
      expect.arrayContaining(['OpenAI', '2.4K Tokens', 'Other providers']),
    );
    expect(textValues()).not.toContain('OpenAI | openai');
    expect(mockResolveProviderIcon).toHaveBeenCalledWith('openai');
  });

  async function renderList(items: readonly AiUsageRankingItem[]) {
    await act(async () => {
      renderer = create(<AiUsageRankingList items={items} locale="en-US" />);
    });
  }

  function rankingRows() {
    return (
      renderer?.root.findAll(
        (node) =>
          node.type === View &&
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('ai-usage-ranking-row-'),
      ) ?? []
    );
  }

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => flattenText(node.props.children)) ?? [];
  }
});

function flattenText(value: unknown): string {
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'props' in value) {
    return flattenText((value as { props: { children?: unknown } }).props.children);
  }
  return '';
}
