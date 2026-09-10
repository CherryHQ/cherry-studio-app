import { createPluginMentionUrl, readPluginMentions } from '../pluginMentions';

const SERVER_A = '00000000-0000-4000-8000-000000000001';
const SERVER_B = '00000000-0000-4000-8000-000000000002';

describe('composer plugin references', () => {
  test('extracts connection identities and keeps only display names in the message', () => {
    const draft = `[飞书](${createPluginMentionUrl(SERVER_A)}) 查找文档，再用 [GitHub](${createPluginMentionUrl(SERVER_B)}) 创建 issue`;
    expect(readPluginMentions(draft)).toEqual({
      pluginServerIds: [SERVER_A, SERVER_B],
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
    expect(readPluginMentions(text)).toEqual({ pluginServerIds: [], text });
  });

  test('deleting the reference removes its plugin from the next send', () => {
    const url = createPluginMentionUrl(SERVER_A);
    expect(readPluginMentions(`[飞书](${url}) 整理文档`).pluginServerIds).toEqual([SERVER_A]);
    expect(readPluginMentions('整理文档')).toEqual({ pluginServerIds: [], text: '整理文档' });
  });

  test('keeps ordinary links, malformed identities, and escaped reference syntax unchanged', () => {
    const text = `[docs](https://example.com) [tool](tool://plugin/invalid) \\[飞书](${createPluginMentionUrl(SERVER_A)})`;
    expect(readPluginMentions(text)).toEqual({ pluginServerIds: [], text });
  });

  test('reads escaped brackets in a plugin display label', () => {
    expect(readPluginMentions(`[Team \\[docs\\]](${createPluginMentionUrl(SERVER_A)})`)).toEqual({
      pluginServerIds: [SERVER_A],
      text: 'Team [docs]',
    });
  });
});
