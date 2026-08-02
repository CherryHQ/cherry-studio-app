export type AiUsageLevel = 0 | 1 | 2 | 3 | 4;

export type AiUsageData = Readonly<Record<string, AiUsageLevel>>;

export type AiUsageCalendarDay = {
  dateKey: string;
  inRange: boolean;
};

export type AiUsageAnimationControls = {
  startAnimation: () => void;
  resetAnimation: () => void;
};
