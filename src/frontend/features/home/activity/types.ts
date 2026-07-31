export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type ActivityData = Readonly<Record<string, ActivityLevel>>;

export type ActivityCalendarDay = {
  dateKey: string;
  inRange: boolean;
};

export type ActivityAnimationControls = {
  startAnimation: () => void;
  resetAnimation: () => void;
};
