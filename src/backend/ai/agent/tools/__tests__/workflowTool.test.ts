import type { PluginGuideSnapshot } from '@/backend/services/builtInMcp';
import { resolveBuiltInPluginGuides } from '@/backend/services/builtInMcp';

import type { RuntimeTool } from '../../runtime';
import {
  createLoadWorkflowTool,
  getPluginWorkflows,
  requireLoadedWorkflows,
  restoreLoadedWorkflows,
} from '../workflowTool';

const guides: PluginGuideSnapshot[] = [
  {
    pluginId: 'github',
    serverId: 'github-connection',
    revision: 2,
    content: 'Inspect the PR head before merging.',
  },
  {
    pluginId: 'feishu',
    serverId: 'feishu-connection',
    revision: 4,
    content: 'Resolve the wiki resource before reading its table.',
  },
];

function tool(ref: RuntimeTool['ref']): RuntimeTool {
  return {
    ref,
    providerName: ref.source === 'mcp' ? `mcp_${ref.rawToolName}` : ref.capabilityId,
    displayName: '',
    description: '',
    inputSchema: {},
    approval: 'ask',
    execute: async () => ({ value: null, artifacts: [] }),
  };
}

function call(workflow_id: string, signal = new AbortController().signal) {
  return { input: { workflow_id }, signal, toolCallId: 'load', turnId: 'turn' };
}

test('loads one attributed plugin guide into trusted instructions without duplicating the body in results', async () => {
  const loader = createLoadWorkflowTool(getPluginWorkflows(guides));
  const result = await loader.execute(call('plugin:github-connection'));
  expect(result.instructions).toMatchObject({ key: 'workflow:plugin:github-connection' });
  expect(result.instructions?.text).toContain('revision 2; connection github-connection');
  expect(result.instructions?.text).toContain(guides[0]!.content);
  expect(result.instructions?.text).not.toContain(guides[1]!.content);
  expect(result.value).toEqual({
    status: 'ok',
    workflow_id: 'plugin:github-connection',
    instructionsInSystem: true,
  });
  expect(JSON.stringify(result.value)).not.toContain(guides[0]!.content);
  expect(result.artifacts).toEqual([]);
});

test('cannot load a disconnected plugin or instructions outside the frozen catalog', async () => {
  const loader = createLoadWorkflowTool(getPluginWorkflows(guides.slice(1)));
  const result = await loader.execute(call('plugin:github-connection'));
  expect(result.value).toMatchObject({ status: 'error' });
  expect(result.instructions).toBeUndefined();
  const controller = new AbortController();
  controller.abort();
  await expect(
    loader.execute(call('plugin:feishu-connection', controller.signal)),
  ).rejects.toThrow();
});

test('gates only tools on a connection with a guide until that guide is loaded', () => {
  const workflows = getPluginWorkflows(guides);
  const [github, feishu, other, builtin] = requireLoadedWorkflows(
    [
      tool({ source: 'mcp', serverId: 'github-connection', rawToolName: 'get_me' }),
      tool({ source: 'mcp', serverId: 'feishu-connection', rawToolName: 'fetch_doc' }),
      tool({ source: 'mcp', serverId: 'custom', rawToolName: 'search' }),
      tool({ source: 'builtin', capabilityId: 'read_file' }),
    ],
    workflows,
  );
  expect(github!.requiredInstructions).toEqual({
    key: 'workflow:plugin:github-connection',
    refusal: expect.stringContaining('"plugin:github-connection"'),
  });
  expect(feishu!.requiredInstructions?.key).toBe('workflow:plugin:feishu-connection');
  expect(other!.requiredInstructions).toBeUndefined();
  expect(builtin!.requiredInstructions).toBeUndefined();
});

test('restores earlier loads with current guide text only while their connection remains', () => {
  const current = [{ ...guides[0]!, revision: 3, content: 'Check required reviews first.' }];
  const restored = restoreLoadedWorkflows(getPluginWorkflows(current), [
    'plugin:github-connection',
    'plugin:feishu-connection',
    'plugin:github-connection',
  ]);
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({ key: 'workflow:plugin:github-connection' });
  expect(restored[0]!.text).toContain('revision 3');
  expect(restored[0]!.text).toContain('Check required reviews first.');
  expect(restored[0]!.text).not.toContain(guides[0]!.content);
});

test.each([
  ['amap', 'maps_around_search'],
  ['github', 'get_me'],
  ['feishu', 'wiki_get_node'],
  ['dingtalk', 'get_document_content'],
  ['notion', 'notion-fetch'],
  ['wecom', 'wecom_identity__whoami'],
])(
  'keeps %s capability routing and critical constraints visible while retaining the complete guide for loading',
  async (pluginId, rawToolName) => {
    const snapshots = resolveBuiltInPluginGuides([
      { pluginId, serverId: `${pluginId}-connection`, rawToolName },
    ]);
    expect(snapshots).toHaveLength(1);
    const guide = snapshots[0]!;
    expect(guide.overview).toBeTruthy();
    const workflows = getPluginWorkflows(snapshots);
    const workflow = workflows.find(
      (candidate) => candidate.id === `plugin:${pluginId}-connection`,
    )!;
    expect(workflow.description).toContain(guide.overview!.replace(/\s+/g, ' ').trim());
    const result = await createLoadWorkflowTool(workflows).execute(call(workflow.id));
    expect(result.instructions?.text).toContain(guide.content);
  },
);
