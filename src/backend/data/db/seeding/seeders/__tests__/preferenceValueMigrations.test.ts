import { collectPreferenceValueMigrations } from '../preferenceValueMigrations';

describe('collectPreferenceValueMigrations', () => {
  test('copies renamed values without overwriting a migrated target', () => {
    const rows = [
      { key: 'feature.csaas.port', scope: 'default', value: 3456 },
      { key: 'shortcut.chat.clear', scope: 'default', value: { binding: ['Cmd', 'L'] } },
      {
        key: 'shortcut.chat.toggle_new_context',
        scope: 'default',
        value: { binding: ['Cmd', 'K'] },
      },
      { key: 'topic.position', scope: 'default', value: 'right' },
    ];

    expect(collectPreferenceValueMigrations(rows)).toEqual([
      { key: 'feature.api_gateway.port', scope: 'default', value: 3456 },
      {
        key: 'shortcut.chat.context.toggle_new',
        scope: 'default',
        value: { binding: ['Cmd', 'K'] },
      },
      { key: 'topic.tab.position', scope: 'default', value: 'right' },
    ]);
  });

  test('projects visible mobile sidebar icons while retaining the source row', () => {
    const rows = [
      {
        key: 'ui.sidebar.icons.visible',
        scope: 'default',
        value: ['assistants', 'store', 'knowledge', 'assistants'],
      },
    ];

    expect(collectPreferenceValueMigrations(rows)).toEqual([
      {
        key: 'ui.sidebar.favorites',
        scope: 'default',
        value: [
          { id: 'assistants', type: 'app' },
          { id: 'knowledge', type: 'app' },
        ],
      },
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({ key: 'ui.sidebar.icons.visible', value: expect.any(Array) }),
    );
  });

  test('does not overwrite an existing desktop target value', () => {
    expect(
      collectPreferenceValueMigrations([
        { key: 'feature.csaas.host', scope: 'default', value: 'old.example' },
        { key: 'feature.api_gateway.host', scope: 'default', value: 'new.example' },
      ]),
    ).toEqual([]);
  });
});
