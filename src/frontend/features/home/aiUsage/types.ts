export type AiUsageLevel = 0 | 1 | 2 | 3 | 4;

export type AiUsageData = Readonly<Record<string, AiUsageLevel>>;

export const aiUsageDetailWindowKeys = ['30d', '90d', '365d'] as const;
export type AiUsageDetailWindowKey = (typeof aiUsageDetailWindowKeys)[number];
export type AiUsageWindowKey = AiUsageDetailWindowKey | '183d';

export type AiUsageTimeRange = {
  from: number;
  to: number;
};

export type AiUsageOverview = {
  activeDays: number;
  cacheHitRate?: number;
  cacheObservedTokens: number;
  data: AiUsageData;
  longestStreak: number;
  peakDay?: {
    dateKey: string;
    totalTokens: number;
  };
  totalTokens: number;
};

export type AiUsageCalendarDay = {
  dateKey: string;
  inRange: boolean;
};

export type AiUsageAnimationControls = {
  replayAnimation: () => void;
};

export type AiUsageModelIdentity = {
  isOther: boolean;
  key: string;
  modelId: string | null;
  providerId: string | null;
  providerName: string | null;
};

export type AiUsageModelUsage = AiUsageModelIdentity & {
  totalTokens: number;
};

export type AiUsageWeekDay = {
  dateKey: string;
  isFuture: boolean;
  totalTokens: number;
};

export type AiUsageWeekSeries = AiUsageModelUsage & {
  values: number[];
};

export type AiUsageWeeklyData = {
  averageTokens: number;
  days: AiUsageWeekDay[];
  series: AiUsageWeekSeries[];
  totalTokens: number;
};
