import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import type { ChartModel } from '../renderModel';
import { buildChartOption } from './buildChartOption';
import type { ChartRenderer } from './ChartRenderer';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

/**
 * echarts implementation. Import echarts/core plus per-chart modules on demand; do not use a full import.
 * Only the isolated Office DOM bundle imports this module; native application code must not import it.
 */
export const echartsChartRenderer: ChartRenderer = {
  render(chart: ChartModel, container: HTMLElement): () => void {
    const instance = echarts.init(container, undefined, { renderer: 'canvas' });
    let resizeObserver: ResizeObserver | undefined;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      resizeObserver?.disconnect();
      instance.dispose();
    };
    try {
      const option = { ...buildChartOption(chart), animation: false };
      instance.setOption(option);
      let hasSized = container.clientWidth > 0 && container.clientHeight > 0;
      resizeObserver = new ResizeObserver(() => {
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        try {
          if (!hasSized) {
            hasSized = true;
            instance.setOption(option);
          }
          instance.resize();
        } catch (error) {
          dispose();
          throw error;
        }
      });
      resizeObserver.observe(container);
    } catch (error) {
      dispose();
      throw error;
    }
    return dispose;
  },
};
