export type AiUsageLevel = 0 | 1 | 2 | 3 | 4;

export type AiUsageData = Readonly<Record<string, AiUsageLevel>>;

export type AiUsageTimeRange = { from: number; to: number };

export type AiUsageCalendarDay = { dateKey: string; inRange: boolean };

export type AiUsageAnimationControls = { replayAnimation: () => void };
