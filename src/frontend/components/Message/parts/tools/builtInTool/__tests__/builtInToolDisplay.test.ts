import BellRingIcon from '@cherrystudio/app-icons/icons/bell-ring';
import FileEditIcon from '@cherrystudio/app-icons/icons/file-edit';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';

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

  test('draws a vector icon on both platforms when no system artwork exists', () => {
    expect(getBuiltInToolDisplay('write_file')).toMatchObject({
      titleKey: 'chat.builtinTool.file.write',
    });
    expect(getBuiltInToolDisplay('edit_file')).toMatchObject({
      titleKey: 'chat.builtinTool.file.edit',
    });

    expect(getAndroidIcon('fileEdit')).toEqual({ icon: FileEditIcon });
    expect(getIosIcon('fileEdit')).toEqual({ icon: FileEditIcon });
    expect(getAndroidIcon('fileText')).toEqual({ icon: FileTextIcon });
    expect(getIosIcon('fileText')).toEqual({ icon: FileTextIcon });
  });

  test('returns no display for a non-built-in tool', () => {
    expect(getBuiltInToolDisplay('calculator')).toBeUndefined();
  });
});
