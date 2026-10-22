export type ForegroundActivityAttention = {
  detail: string;
  phase: 'awaiting-approval' | 'awaiting-answer' | 'failed';
  title: string;
  url?: string;
};
