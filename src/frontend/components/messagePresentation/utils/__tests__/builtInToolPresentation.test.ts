import { BellRingIcon, DatabaseIcon } from '@cherrystudio/app-icons';

import { getBuiltInToolPresentation as getAndroidPresentation } from '../builtInToolPresentation/builtInToolPresentation.android';
import { getBuiltInToolPresentation as getIosPresentation } from '../builtInToolPresentation/builtInToolPresentation.ios';

describe('built-in tool presentation', () => {
  test('selects the platform visual while preserving the tool title', () => {
    const android = getAndroidPresentation('reminder_list_collections');
    const ios = getIosPresentation('reminder_list_collections');

    expect(android).toEqual({
      icon: BellRingIcon,
      titleKey: 'chat.builtinTool.reminders.listLists',
    });
    expect(ios?.imageSource).toBeDefined();
    expect(ios?.icon).toBeUndefined();
    expect(ios?.titleKey).toBe('chat.builtinTool.reminders.listLists');
  });

  test('uses the provider icon on both platforms for provider discovery', () => {
    const expected = {
      icon: DatabaseIcon,
      titleKey: 'chat.builtinTool.providers.list',
    };

    expect(getAndroidPresentation('list_providers')).toEqual(expected);
    expect(getIosPresentation('list_providers')).toEqual(expected);
  });

  test('returns no presentation for a non-built-in tool', () => {
    expect(getAndroidPresentation('calculator')).toBeUndefined();
    expect(getIosPresentation('calculator')).toBeUndefined();
  });
});
