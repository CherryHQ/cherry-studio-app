import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageRankingItem } from '../../types';
import { AiUsageRankingList } from '../AiUsageRankingList';

const mockResolveProviderIcon = jest.fn((_providerId: string) => undefined);
const mockResolveIcon = jest.fn(
  (_modelId: string, _providerId: string): { dark: string; light: string } | undefined => undefined,
);
const mockImage = jest.fn((_props: unknown) => null);

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    LegendList: (props: Record<string, unknown>) => {
      const {
        data,
        extraData,
        keyExtractor,
        ListEmptyComponent,
        ListFooterComponent,
        ListHeaderComponent,
        renderItem,
        ...viewProps
      } = props as {
        data: AiUsageRankingItem[];
        extraData: unknown;
        keyExtractor: (item: AiUsageRankingItem) => string;
        ListEmptyComponent?: React.ReactNode;
        ListFooterComponent?: React.ReactNode;
        ListHeaderComponent?: React.ReactNode;
        renderItem: (options: Record<string, unknown>) => React.ReactNode;
      } & Record<string, unknown>;

      return (
        <MockView
          {...viewProps}
          data={data}
          extraData={extraData}
          ListHeaderComponent={ListHeaderComponent}
        >
          {ListHeaderComponent}
          {data.length === 0 ? ListEmptyComponent : null}
          {data.map((item, index) => (
            <React.Fragment key={keyExtractor(item)}>
              {renderItem({ data, extraData, index, item, type: undefined })}
            </React.Fragment>
          ))}
          {ListFooterComponent}
        </MockView>
      );
    },
  };
});

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveIcon: (modelId: string, providerId: string) => mockResolveIcon(modelId, providerId),
  resolveProviderIcon: (providerId: string) => mockResolveProviderIcon(providerId),
}));
jest.mock('@/frontend/components/nativePrimitives', () => ({
  Image: (props: unknown) => mockImage(props),
}));
jest.mock('@cherrystudio/app-icons', () => ({
  ChevronDownIcon: () => null,
  EllipsisIcon: () => null,
}));
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
    mockResolveIcon.mockReturnValue(undefined);
    mockResolveProviderIcon.mockReturnValue(undefined);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('uses desktop model labels and reveals seven more rows per press', async () => {
    await renderList(modelItems);

    const list = renderer?.root.findByProps({ testID: 'ai-usage-ranking-list' });
    expect(list?.props.recycleItems).toBe(true);
    expect(list?.props.data).toHaveLength(7);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-ranking-header' })).toBeDefined();
    expect(rankingRows()).toHaveLength(7);
    expect(textValues()).toEqual(expect.arrayContaining(['model-0 | Provider', '1K Tokens']));
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-ranking-progress-0' }).props.className,
    ).toBe('h-1 min-w-1 rounded-full bg-muted-foreground');
    // Separators sit above each row and clear the icon column, so the first row has none.
    expect(separators()).toHaveLength(6);

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

  it('uses model service avatar styling at the larger ranking size', async () => {
    mockResolveIcon.mockReturnValue({ dark: 'claude-dark', light: 'claude-light' });
    const claudeItem: AiUsageRankingItem = {
      groupBy: 'model',
      isOther: false,
      key: 'model:claude',
      modelId: 'claude-sonnet-4',
      providerId: 'anthropic',
      providerName: 'Anthropic',
      totalTokens: 175_800,
    };

    await renderList([claudeItem]);

    const frame = renderer?.root
      .findAll(
        (node) => node.type === View && node.props.testID === 'ai-usage-ranking-icon-model:claude',
      )
      .at(0);
    expect(frame?.props.className).toBe(
      'items-center justify-center overflow-hidden border border-border border-continuous',
    );
    expect(frame?.props.style).toEqual({ borderRadius: 6, height: 32, width: 32 });
    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'claude-light',
        style: {
          borderRadius: 5,
          height: 32 * (5 / 7),
          width: 32 * (5 / 7),
        },
      }),
    );
  });

  it('collapses back to the first page only when the reset key changes', async () => {
    await renderList(modelItems);
    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-show-more' }).props.onPress(),
    );
    expect(rankingRows()).toHaveLength(14);

    // A background refresh under the same key must not throw away the expanded page.
    await renderList(modelItems.slice(0, 20));
    expect(rankingRows()).toHaveLength(14);

    await renderList(modelItems, '2026-08-03:model');
    expect(rankingRows()).toHaveLength(7);
  });

  async function renderList(items: readonly AiUsageRankingItem[], resetKey = '2026-08-02:model') {
    await act(async () => {
      const element = (
        <AiUsageRankingList
          items={items}
          listHeaderComponent={<View testID="ai-usage-ranking-header" />}
          locale="en-US"
          resetKey={resetKey}
        />
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
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

  function separators() {
    return (
      renderer?.root.findAll(
        (node) =>
          node.type === View &&
          node.props.className === 'absolute top-0 right-0 left-11 border-border border-t',
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
