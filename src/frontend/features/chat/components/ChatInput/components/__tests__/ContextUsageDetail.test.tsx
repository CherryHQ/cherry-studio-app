import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceDefaults } from '@/shared/data/preference';

import { deriveContextUsage } from '../../utils/contextUsage';
import { ContextUsageDetail } from '../ContextUsageDetail';

let mockRate = false;
let mockStatus: string | null = null;
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => [mockRate] }));
jest.mock('@/frontend/features/chat/runtime', () => ({ useAgentContextStatus: () => mockStatus }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    BottomSheet: ({ children, ...props }: any) => React.createElement('Sheet', props, children),
  };
});
jest.mock('@/frontend/components/AiUsageDetail', () => ({
  AiUsageDetailRow: (props: object) => jest.requireActual('react').createElement('Row', props),
}));

describe('ContextUsageDetail', () => {
  let renderer: ReactTestRenderer;
  const usage = (contextTokens: number, read?: number) =>
    deriveContextUsage(100, {
      contextTokens,
      inputTokens: 10,
      inputTokenDetails: { cacheReadTokens: read },
    })!;
  const render = (value = usage(20)) => (
    <ContextUsageDetail open onClose={() => {}} usage={value} sessionId="s" testID="detail" />
  );
  const rows = () => renderer.root.findAllByType('Row' as never);
  const row = (label: string) => rows().find((item) => item.props.label === label)!;
  beforeEach(() => {
    mockRate = PreferenceDefaults['chat.cache_hit_rate.enabled'];
    mockStatus = null;
  });
  afterEach(() => act(() => renderer.unmount()));
  test('updates preference, measurements and raw cache independently, including zero and unavailable rates', () => {
    act(() => {
      renderer = create(render());
    });
    expect(row('chat.messageUsage.cacheRead').props.value).toBe('chat.messageUsage.unavailable');
    expect(
      renderer.root.findAllByProps({ testID: 'chat-context-usage-cache-hit-rate' }),
    ).toHaveLength(0);
    mockRate = true;
    act(() => renderer.update(render()));
    expect(row('chat.contextUsage.cacheHitRate').props.value).toBe('chat.messageUsage.unavailable');
    act(() => renderer.update(render(usage(40, 0))));
    expect(row('chat.contextUsage.used').props.value).toBe('40');
    expect(row('chat.messageUsage.cacheRead').props.value).toBe('0');
    expect(row('chat.contextUsage.cacheHitRate').props.value).toBe('0%');
    mockRate = false;
    act(() => renderer.update(render(usage(40, 0))));
    expect(row('chat.messageUsage.cacheRead').props.value).toBe('0');
    expect(
      renderer.root.findAllByProps({ testID: 'chat-context-usage-cache-hit-rate' }),
    ).toHaveLength(0);
  });
  test('shows current compaction status without inferring success', () => {
    act(() => {
      renderer = create(render());
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('chat.compaction.compacting');
    mockStatus = 'compacting';
    act(() => renderer.update(render()));
    expect(JSON.stringify(renderer.toJSON())).toContain('chat.compaction.compacting');
    mockStatus = 'compaction-failed';
    act(() => renderer.update(render()));
    expect(JSON.stringify(renderer.toJSON())).toContain('chat.compaction.failed');
  });
});
