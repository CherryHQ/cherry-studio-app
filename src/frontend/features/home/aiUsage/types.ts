export type AiUsageLevel = 0 | 1 | 2 | 3 | 4;

export type AiUsageData = Readonly<Record<string, AiUsageLevel>>;

export const aiUsageWindowKeys = ['30d', '90d', '365d'] as const;
export type AiUsageWindowKey = (typeof aiUsageWindowKeys)[number];

export type AiUsageTimeRange = {
  from: number;
  to: number;
};

export type AiUsageOverview = {
  activeDays: number;
  data: AiUsageData;
  longestStreak: number;
  peakDay?: {
    dateKey: string;
    totalTokens: number;
  };
  totalRequests: number;
  totalTokens: number;
};

export type AiUsageCalendarDay = {
  dateKey: string;
  inRange: boolean;
};

export type AiUsageAnimationControls = {
  replayAnimation: () => void;
};
