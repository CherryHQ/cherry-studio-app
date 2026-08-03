import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageModelUsage } from '../../types';
import { AiUsageModelList } from '../AiUsageModelList';

jest.mock('@cherrystudio/ui/icons', () => ({ resolveIcon: () => undefined }));
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
        'aiUsage.showMore': 'Show more',
        'aiUsage.tokensValue': `${options?.tokens} Tokens`,
        'aiUsage.unknownModel': 'Unknown model',
      })[key] ?? key,
  }),
}));

const items: AiUsageModelUsage[] = Array.from({ length: 15 }, (_, index) => ({
  isOther: false,
  key: `model-${index}`,
  modelId: `provider::model-${index}`,
  providerId: 'provider',
  providerName: 'Provider',
  totalTokens: 1_000 - index * 10,
}));

describe('AiUsageModelList', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('uses desktop model labels and reveals seven more rows per press', async () => {
    await act(async () => {
      renderer = create(<AiUsageModelList items={items} locale="en-US" />);
    });

    expect(modelRows()).toHaveLength(7);
    expect(textValues()).toEqual(expect.arrayContaining(['model-0 | Provider', '1K Tokens']));
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-model-progress-0' }).props.className,
    ).toBe('h-1 min-w-1 rounded-full bg-primary');

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-show-more' }).props.onPress(),
    );
    expect(modelRows()).toHaveLength(14);

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-show-more' }).props.onPress(),
    );
    expect(modelRows()).toHaveLength(15);
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-show-more' })).toHaveLength(0);
  });

  function modelRows() {
    return (
      renderer?.root.findAll(
        (node) =>
          node.type === View &&
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('ai-usage-model-row-'),
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
