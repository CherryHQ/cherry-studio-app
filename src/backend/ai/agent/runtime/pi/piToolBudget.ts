import { defineDoc } from '@earendil-works/pi-durable';

/** Per-input failed tool groups. Keep the released document identity; legacy counters are unused. */
export const PiToolBudget = defineDoc<{
  inputId: number;
  failedGroups: string[];
}>({
  kind: 'cherry.tool-budget',
  version: 1,
  scope: 'conversation',
  checkpointWhen: () => false,
  history: 'latest',
  fork: 'current',
  initial: () => ({ inputId: 0, failedGroups: [] }),
});
