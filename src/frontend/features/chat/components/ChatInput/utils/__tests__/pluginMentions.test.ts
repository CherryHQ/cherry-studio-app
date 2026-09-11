import {
  createPluginMentionLabel,
  createPluginMentionUrl,
  readPluginMentions,
} from '../pluginMentions';

const SERVER_A = '00000000-0000-4000-8000-000000000001';
const SERVER_B = '00000000-0000-4000-8000-000000000002';

describe('composer plugin references', () => {
  test('snapshots inline artwork identity and UTF-16 offsets without sending object characters', () => {
    const draft = `📄 用 [${createPluginMentionLabel('飞书')}](${createPluginMentionUrl(SERVER_A, 'feishu')}) 和 [${createPluginMentionLabel('GitHub')}](${createPluginMentionUrl(SERVER_B, 'github')})`;
    expect(readPluginMentions(draft)).toEqual({
      text: '📄 用 飞书 和 GitHub',
      pluginServerIds: [SERVER_A, SERVER_B],
      pluginReferences: [
        { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 5 },
        { type: 'plugin', pluginId: 'github', label: 'GitHub', offset: 10 },
      ],
    });
  });

  test('retains repeated display occurrences while selecting the connection only once', () => {
    const url = createPluginMentionUrl(SERVER_A, 'feishu');
    const parsed = readPluginMentions(`[飞书](${url}) [Feishu](${url})`);
    expect(parsed.pluginServerIds).toEqual([SERVER_A]);
    expect(parsed.pluginReferences).toEqual([
      { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 0 },
      { type: 'plugin', pluginId: 'feishu', label: 'Feishu', offset: 3 },
    ]);
  });

  test('extracts connection identities and keeps only display names in the message', () => {
    const draft = `[飞书](${createPluginMentionUrl(SERVER_A)}) 查找文档，再用 [GitHub](${createPluginMentionUrl(SERVER_B)}) 创建 issue`;
    expect(readPluginMentions(draft)).toEqual({
      pluginServerIds: [SERVER_A, SERVER_B],
      pluginReferences: [],
      text: '飞书 查找文档，再用 GitHub 创建 issue',
    });
  });

  test('deduplicates repeated references by connection, independent of translated labels', () => {
    const url = createPluginMentionUrl(SERVER_A);
    expect(readPluginMentions(`[飞书](${url}) [Feishu](${url})`).pluginServerIds).toEqual([
      SERVER_A,
    ]);
  });

  test('plain names and @ characters never select a plugin', () => {
    const text = '@飞书 @GitHub 帮我整理';
    expect(readPluginMentions(text)).toEqual({ pluginServerIds: [], pluginReferences: [], text });
  });

  test('deleting the reference removes its plugin from the next send', () => {
    const url = createPluginMentionUrl(SERVER_A);
    expect(readPluginMentions(`[飞书](${url}) 整理文档`).pluginServerIds).toEqual([SERVER_A]);
    expect(readPluginMentions('整理文档')).toEqual({
      pluginServerIds: [],
      pluginReferences: [],
      text: '整理文档',
    });
  });

  test('keeps ordinary links, malformed identities, and escaped reference syntax unchanged', () => {
    const text = `[docs](https://example.com) [tool](tool://plugin/invalid) \\[飞书](${createPluginMentionUrl(SERVER_A)})`;
    expect(readPluginMentions(text)).toEqual({ pluginServerIds: [], pluginReferences: [], text });
  });

  test('reads escaped brackets in a plugin display label', () => {
    expect(readPluginMentions(`[Team \\[docs\\]](${createPluginMentionUrl(SERVER_A)})`)).toEqual({
      pluginServerIds: [SERVER_A],
      pluginReferences: [],
      text: 'Team [docs]',
    });
  });
});
