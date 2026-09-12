export type AiUsageLevel = 0 | 1 | 2 | 3 | 4;

export type AiUsageData = Readonly<Record<string, AiUsageLevel>>;

export type AiUsageTimeRange = {
  from: number;
  to: number;
};

export type AiUsageWeekPage = {
  key: string;
  range: AiUsageTimeRange;
  weeksAgo: number;
};

export type AiUsageDetailPage = AiUsageWeekPage & {
  selectedDateKey: string;
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

export type AiUsageRankingGroup = 'model' | 'provider';

export type AiUsageRankingItem = AiUsageModelIdentity & {
  groupBy: AiUsageRankingGroup;
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
