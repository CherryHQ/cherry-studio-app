export type ForegroundActivityAttention = {
  detail: string;
  phase: 'awaiting-approval' | 'failed';
  title: string;
  url?: string;
};
