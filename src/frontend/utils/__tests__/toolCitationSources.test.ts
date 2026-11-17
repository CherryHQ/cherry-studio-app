import { citableToolName, resolveMessageCitations, toolCitationSources } from '../messageCitations';

test('only declared built-ins and exact Cherry runtime names can supply tool citations', () => {
  expect(citableToolName('web_search')).toBeUndefined();
  expect(citableToolName('web_search', undefined, true)).toBe('web_search');
  expect(citableToolName('mcp__other__web_search')).toBeUndefined();
  expect(citableToolName('tool_call', { name: 'mcp__cherry-tools__web_fetch' })).toBe('web_fetch');
});

test('persisted result skeletons resolve citations without loading the original document blob', () => {
  const sources = toolCitationSources('web_search', {
    $persistedToolOutput: {
      shape: 'entities',
      skeleton: [{ id: 'lookup-2', title: 'Source', url: 'https://example.com/a' }],
    },
  });
  const result = resolveMessageCitations(
    [{ type: 'text', text: 'Claim [cite:lookup-2]' }],
    sources,
  );
  expect(result.sourceNumberById.get('lookup-2')).toBe(1);
  expect(result.textByPartIndex.get(0)?.markdown).toContain('cite:https%3A%2F%2Fexample.com%2Fa');
});

test('invalid source URLs never become clickable citations', () => {
  expect(toolCitationSources('web_search', [{ id: 'x', url: 'javascript:alert(1)' }])).toEqual([]);
  expect(
    toolCitationSources('web_search', [{ id: 'x', url: 'https://user:secret@example.com' }]),
  ).toEqual([]);
});
