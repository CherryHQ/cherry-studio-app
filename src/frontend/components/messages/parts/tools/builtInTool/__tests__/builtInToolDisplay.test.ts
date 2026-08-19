import { BellRingIcon } from '@cherrystudio/app-icons';

import { getBuiltInToolDisplay } from '../builtInToolDisplay';
import { getBuiltInToolIcon as getAndroidIcon } from '../builtInToolIcon/builtInToolIcon.android';
import { getBuiltInToolIcon as getIosIcon } from '../builtInToolIcon/builtInToolIcon.ios';

describe('built-in tool display', () => {
  test('combines the shared title with the selected platform icon', () => {
    expect(getBuiltInToolDisplay('reminder_list_collections')).toMatchObject({
      titleKey: 'chat.builtinTool.reminders.listLists',
    });

    expect(getAndroidIcon('reminders')).toEqual({ icon: BellRingIcon });
    expect(getIosIcon('reminders').imageSource).toBeDefined();
    expect(getIosIcon('reminders').icon).toBeUndefined();
  });

  test('returns no display for a non-built-in tool', () => {
    expect(getBuiltInToolDisplay('calculator')).toBeUndefined();
  });
});
