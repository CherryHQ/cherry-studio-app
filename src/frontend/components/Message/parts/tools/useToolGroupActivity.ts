import { useEffect, useState } from 'react';

const MIN_ACTIVITY_DURATION_MS = 1200;

/** Fast calls update one live row without cycling its activity label every frame. */
export function useToolGroupActivity(activity: string | undefined, isRunning: boolean) {
  const [display, setDisplay] = useState(() => ({ activity, changedAt: Date.now() }));
  useEffect(() => {
    if (display.activity === activity) return;
    const delay = isRunning
      ? Math.max(0, MIN_ACTIVITY_DURATION_MS - (Date.now() - display.changedAt))
      : 0;
    const timer = setTimeout(() => setDisplay({ activity, changedAt: Date.now() }), delay);
    return () => clearTimeout(timer);
  }, [activity, display.activity, display.changedAt, isRunning]);
  return isRunning ? display.activity : activity;
}
