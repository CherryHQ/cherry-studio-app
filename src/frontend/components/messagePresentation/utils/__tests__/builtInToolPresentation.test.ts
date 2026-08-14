import { DatabaseIcon } from '@cherrystudio/app-icons';

import { getBuiltInToolPresentation } from '../builtInToolPresentation';

describe('built-in tool presentation', () => {
  test('maps provider discovery to its public title and provider icon', () => {
    expect(getBuiltInToolPresentation('list_providers')).toEqual({
      androidIcon: DatabaseIcon,
      titleKey: 'chat.builtinTool.providers.list',
    });
  });
});
