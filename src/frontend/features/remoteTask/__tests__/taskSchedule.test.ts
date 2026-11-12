import { createInstance } from 'i18next';

import en from '@/frontend/i18n/locales/en-us.json';

import { taskSchedule } from '../taskSchedule';

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init({
    lng: 'en-US',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: { 'en-US': { translation: en } },
  });
});

it('keeps cron wall time and timezone instead of converting it to the phone timezone', () => {
  expect(
    taskSchedule({ kind: 'cron', expr: '0 9 * * *', timezone: 'Asia/Shanghai' }, 'en-US', i18n.t),
  ).toBe('Daily at 09:00 (Asia/Shanghai)');
  expect(taskSchedule({ kind: 'cron', expr: '30 8 * * 7' }, 'en-US', i18n.t)).toBe(
    'Every Sunday at 08:30',
  );
});

it('retains complex cron expressions without guessing a daily or weekly label', () => {
  expect(taskSchedule({ kind: 'cron', expr: '0 9 1 * 1' }, 'en-US', i18n.t)).toBe(
    'Schedule: 0 9 1 * 1',
  );
});

it('preserves interval precision and handles an out-of-range one-time date', () => {
  expect(taskSchedule({ kind: 'interval', ms: 60_000 }, 'en-US', i18n.t)).toBe('Every 1 min');
  expect(taskSchedule({ kind: 'interval', ms: 500 }, 'en-US', i18n.t)).toBe('Every 0.5 s');
  expect(taskSchedule({ kind: 'once', at: Number.MAX_SAFE_INTEGER }, 'en-US', i18n.t)).toBe(
    'One-time',
  );
});
