import type { TFunction } from 'i18next';

import type { RemoteTaskTrigger } from '@/shared/contracts/remoteAgent';

/** Common calendar rules are readable; other valid cron rules retain their configured expression. */
export function taskSchedule(trigger: RemoteTaskTrigger, language: string, t: TFunction): string {
  if (trigger.kind === 'once') {
    if (!Number.isFinite(new Date(trigger.at).getTime())) return t('remoteTasks.schedule.once');
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      trigger.at,
    );
  }
  if (trigger.kind === 'interval') {
    const units = [
      [86_400_000, 'remoteTasks.schedule.unit.day'],
      [3_600_000, 'remoteTasks.schedule.unit.hour'],
      [60_000, 'remoteTasks.schedule.unit.minute'],
    ] as const;
    const [divisor, unit] =
      units.find(([divisor]) => trigger.ms % divisor === 0) ??
      ([1000, 'remoteTasks.schedule.unit.second'] as const);
    const value = new Intl.NumberFormat(language, {
      maximumFractionDigits: 3,
    }).format(trigger.ms / divisor);
    const interval = t(unit, { value });
    return t('remoteTasks.schedule.interval', { interval });
  }
  const fields = trigger.expr.trim().split(/\s+/);
  const [minute, hour, day, month, weekday] = fields;
  let schedule = t('remoteTasks.schedule.cron', { expression: trigger.expr });
  if (
    fields.length === 5 &&
    /^\d+$/.test(minute!) &&
    /^\d+$/.test(hour!) &&
    Number(minute) < 60 &&
    Number(hour) < 24 &&
    day === '*' &&
    month === '*'
  ) {
    const time = new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 1, Number(hour), Number(minute)));
    if (weekday === '*') schedule = t('remoteTasks.schedule.daily', { time });
    else if (/^[0-7]$/.test(weekday!)) {
      const day = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(
        Date.UTC(2023, 0, 1 + (Number(weekday) % 7)),
      );
      schedule = t('remoteTasks.schedule.weekly', { day, time });
    }
  }
  return trigger.timezone
    ? t('remoteTasks.schedule.zoned', { schedule, timezone: trigger.timezone })
    : schedule;
}
