import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { Path, Rect } from 'react-native-svg';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageWeeklyData } from '../../types';
import { AiUsageWeeklyChart } from '../AiUsageWeeklyChart';

const mockSelectDate = jest.fn();

jest.mock('react-native-chart-kit/v2', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BarChart: (props: Record<string, unknown>) => <MockView {...props} />,
  };
});

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (names: string | readonly string[]) => {
    const colors: Record<string, string> = {
      'default-foreground': '#111111',
      info: '#0088ff',
      'muted-foreground': '#777777',
      primary: '#00aa66',
      separator: '#cccccc',
      success: '#22aa44',
      warning: '#ff9900',
    };
    return Array.isArray(names) ? names.map((name) => colors[name]) : colors[names as string];
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { date?: string; tokens?: string }) =>
      ({
        'aiUsage.average': 'Average',
        'aiUsage.dayAccessibility': `${options?.date}, ${options?.tokens} Tokens`,
        'aiUsage.other': 'Other',
        'aiUsage.otherModels': 'Other models',
        'aiUsage.tokensValue': `${options?.tokens} Tokens`,
        'aiUsage.unknownModel': 'Unknown model',
        'aiUsage.weekTotal': 'Week total',
        'aiUsage.weekChartAccessibility': 'Weekly Token usage by model',
      })[key] ?? key,
  }),
}));

const data: AiUsageWeeklyData = {
  averageTokens: 100,
  days: [
    { dateKey: '2026-08-03', isFuture: false, totalTokens: 200 },
    { dateKey: '2026-08-04', isFuture: false, totalTokens: 100 },
    { dateKey: '2026-08-05', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-08-06', isFuture: true, totalTokens: 0 },
    { dateKey: '2026-08-07', isFuture: true, totalTokens: 0 },
    { dateKey: '2026-08-08', isFuture: true, totalTokens: 0 },
    { dateKey: '2026-08-09', isFuture: true, totalTokens: 0 },
  ],
  series: [
    {
      isOther: false,
      key: 'model-a',
      modelId: 'provider::model-a',
      providerId: 'provider',
      providerName: 'Provider',
      totalTokens: 200,
      values: [150, 50, 0, 0, 0, 0, 0],
    },
    {
      isOther: true,
      key: 'other',
      modelId: null,
      providerId: null,
      providerName: null,
      totalTokens: 100,
      values: [50, 50, 0, 0, 0, 0, 0],
    },
  ],
  totalTokens: 300,
};

describe('AiUsageWeeklyChart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('fits a non-scrollable stacked chart and exposes the average line', async () => {
    await renderChart();

    const chart = renderer?.root.findByProps({ testID: 'ai-usage-bar-chart' });
    expect(chart?.props.mode).toBe('stacked');
    expect(chart?.props.scrollable).toBe(false);
    expect(chart?.props.tooltip).toBe(false);
    expect(chart?.props.data).toHaveLength(7);
    expect(chart?.props.series).toHaveLength(2);
    expect(chart?.props.yDomain).toEqual([0, 250]);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-average-line' })).toBeDefined();
    expect(textValues()).toEqual(
      expect.arrayContaining([
        '0',
        '50',
        '150',
        '250',
        'model-a',
        'Other',
        'Average',
        'Week total',
        '300 Tokens',
        '200',
        '100',
      ]),
    );
    expect(textValues()).not.toContain('200 Tokens');
    expect(textValues()).not.toContain('100 Tokens');

    const renderBar = chart?.props.renderBar;
    const bottomSegment = renderBar(barRenderProps(0));
    const topSegment = renderBar(barRenderProps(1));
    expect(bottomSegment.type).toBe(Rect);
    expect(bottomSegment.props.rx).toBe(0);
    expect(topSegment.type).toBe(Path);
  });

  it('selects elapsed days and disables future dates', async () => {
    await renderChart();
    const selected = renderer?.root.findByProps({ testID: 'ai-usage-day-2026-08-04' });
    const future = renderer?.root.findByProps({ testID: 'ai-usage-day-2026-08-06' });

    expect(selected?.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(future?.props.disabled).toBe(true);

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-day-2026-08-03' }).props.onPress(),
    );
    expect(mockSelectDate).toHaveBeenCalledWith('2026-08-03');
  });

  it('keeps a fixed skeleton while loading', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageWeeklyChart
          data={data}
          isLoading
          locale="en-US"
          selectedDateKey="2026-08-04"
          onSelectDate={mockSelectDate}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart-loading' })).toBeDefined();
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-bar-chart' })).toHaveLength(0);
  });

  async function renderChart() {
    await act(async () => {
      renderer = create(
        <AiUsageWeeklyChart
          data={data}
          isLoading={false}
          locale="en-US"
          selectedDateKey="2026-08-04"
          onSelectDate={mockSelectDate}
        />,
      );
    });
    const layoutNode = renderer?.root
      .findAll((node) => typeof node.props.onLayout === 'function')
      .at(0);
    await act(async () =>
      layoutNode?.props.onLayout({
        nativeEvent: { layout: { height: 0, width: 360, x: 0, y: 0 } },
      }),
    );
  }

  function textValues(): ReactNode[] {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children) ?? [];
  }
});

function barRenderProps(seriesIndex: number) {
  return {
    bar: {
      dataIndex: 0,
      height: 40,
      seriesIndex,
      width: 20,
      x: 10,
      y: 20,
    },
    fill: '#00aa66',
    radius: 3,
  };
}
